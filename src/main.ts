import './style.css'
import {
  studentLogin,
  staffLogin,
  applyOD,
  getODHistory,
  getPendingRequests,
  approveOD,
  getAllStaff,
  saveStudentSettings
} from './services/api'

const app = document.querySelector<HTMLDivElement>('#app')!

/*
  EOD MANAGEMENT SYSTEM
  ---------------------
  UI VERSION

  Login uses the backend API. Dashboard/OD screens keep the
  existing local UI data unless a backend endpoint is explicitly used.
*/

type UserType = 'student' | 'staff'

let currentUser: Student | Staff | null = null

interface Student {
  id?: number
  name: string
  register_no: string
  department: string
  year: string
  semester: string
  section: string
}

interface Staff {
  id?: number
  name: string
  staff_id: string
  department: string
  designation: string
}

interface ODRequest {
  id: number
  fromDate: string
  toDate: string
  fromTime: string
  toTime: string
  event: string
  venue: string
  status: 'Pending' | 'Approved' | 'Rejected'
  reason: string
  link: string
  studentName?: string
  studentYear?: string
  studentSection?: string
  studentId?: number
  approval?: ApprovalTracking
}

interface ApprovalTracking {
  eventCoordinator: { staffId: number; status: 'Pending' | 'Approved' | 'Rejected' | 'Waiting' }
  tutor: { staffId: number; status: 'Pending' | 'Approved' | 'Rejected' | 'Waiting' }
  yearIncharge: { staffId: number; status: 'Pending' | 'Approved' | 'Rejected' | 'Waiting' }
  hod: { staffId: number; status: 'Pending' | 'Approved' | 'Rejected' | 'Waiting' }
}

/* =========================================================
   DEMO DATA
   ========================================================= */

let odRequests: ODRequest[] = [
  {
    id: 1,
    fromDate: '2026-08-18',
    toDate: '2026-08-18',
    fromTime: '09:00',
    toTime: '17:00',
    event: 'Smart India Hackathon',
    venue: 'Chennai',
    status: 'Approved',
    reason: 'Participating in hackathon',
    link: 'https://example.com/sih'
  },
  {
    id: 2,
    fromDate: '2026-08-12',
    toDate: '2026-08-13',
    fromTime: '09:00',
    toTime: '16:00',
    event: 'Technical Symposium',
    venue: 'PSNA Auditorium',
    status: 'Pending',
    reason: 'Technical event participation',
    link: 'https://example.com/symposium'
  },
  {
    id: 3,
    fromDate: '2026-08-05',
    toDate: '2026-08-05',
    fromTime: '10:00',
    toTime: '15:00',
    event: 'Coding Competition',
    venue: 'Computer Lab',
    status: 'Rejected',
    reason: 'Inter-college competition',
    link: 'https://example.com/competition'
  }
]

/* =========================================================
   OD APPROVAL TRACKING (FRONTEND ONLY)
   ========================================================= */

const OD_APPROVAL_STORAGE_KEY = 'eod_od_approval_tracking'
const STUDENT_SETTINGS_STORAGE_KEY = 'eod_student_settings'

function readODApprovalTracking(): Record<string, ApprovalTracking> {
  try {
    return JSON.parse(localStorage.getItem(OD_APPROVAL_STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function writeODApprovalTracking(data: Record<string, ApprovalTracking>) {
  localStorage.setItem(OD_APPROVAL_STORAGE_KEY, JSON.stringify(data))
}

function getStudentSettings(studentId: number): any | null {
  try {
    const all = JSON.parse(localStorage.getItem(STUDENT_SETTINGS_STORAGE_KEY) || '{}')
    return all[String(studentId)] || null
  } catch {
    return null
  }
}

function saveStudentSettingsLocally(studentId: number, settings: any) {
  try {
    const all = JSON.parse(localStorage.getItem(STUDENT_SETTINGS_STORAGE_KEY) || '{}')
    all[String(studentId)] = settings
    localStorage.setItem(STUDENT_SETTINGS_STORAGE_KEY, JSON.stringify(all))
  } catch {
    // Keep the existing backend save as the source of truth if local storage is unavailable.
  }
}

function createApprovalTracking(studentId: number): ApprovalTracking | null {
  const settings = getStudentSettings(studentId)
  if (!settings) return null

  const eventCoordinator = Number(settings.event_coordinator)
  const tutor = Number(settings.tutor)
  const yearIncharge = Number(settings.year_incharge)
  const hod = Number(settings.hod)

  if (!eventCoordinator || !tutor || !yearIncharge || !hod) return null

  return {
    eventCoordinator: { staffId: eventCoordinator, status: 'Pending' },
    tutor: { staffId: tutor, status: 'Waiting' },
    yearIncharge: { staffId: yearIncharge, status: 'Waiting' },
    hod: { staffId: hod, status: 'Waiting' }
  }
}

function nextApprovalRole(tracking: ApprovalTracking | null): 'eventCoordinator' | 'tutor' | 'yearIncharge' | 'hod' | 'completed' | null {
  if (!tracking) return null
  if (tracking.eventCoordinator.status === 'Pending') return 'eventCoordinator'
  if (tracking.tutor.status === 'Pending') return 'tutor'
  if (tracking.yearIncharge.status === 'Pending') return 'yearIncharge'
  if (tracking.hod.status === 'Pending') return 'hod'
  if ([tracking.eventCoordinator, tracking.tutor, tracking.yearIncharge, tracking.hod].every(step => step.status === 'Approved')) return 'completed'
  return null
}

function applyApprovalDecision(requestId: number, staffId: number, action: 'Approved' | 'Rejected'): ApprovalTracking | null {
  const all = readODApprovalTracking()
  const tracking = all[String(requestId)]
  if (!tracking) return null

  const roles: Array<keyof ApprovalTracking> = ['eventCoordinator', 'tutor', 'yearIncharge', 'hod']
  const currentRole = nextApprovalRole(tracking)
  if (currentRole === 'completed' || !currentRole || !roles.includes(currentRole)) return tracking

  const currentStep = tracking[currentRole]
  if (currentStep.staffId !== staffId || currentStep.status !== 'Pending') return tracking

  currentStep.status = action

  if (action === 'Approved') {
    const index = roles.indexOf(currentRole)
    if (index >= 0 && index < roles.length - 1) {
      tracking[roles[index + 1]].status = 'Pending'
    }
  }

  all[String(requestId)] = tracking
  writeODApprovalTracking(all)
  return tracking
}

function getApprovalTracking(request: ODRequest): ApprovalTracking | null {
  const all = readODApprovalTracking()
  return all[String(request.id)] || request.approval || null
}

function approvalTrackingHTML(tracking: ApprovalTracking | null): string {
  if (!tracking) {
    return `<p style="margin-top:12px;color:#64748b;">Approval tracking will appear after the student staff settings are saved.</p>`
  }

  const steps = [
    ['Event Coordinator', tracking.eventCoordinator],
    ['Tutor', tracking.tutor],
    ['Year Incharge', tracking.yearIncharge],
    ['HOD', tracking.hod]
  ] as const

  return `
    <div style="margin-top:18px;padding:18px;border-radius:14px;background:#f8fafc;">
      <strong>Approval Tracking</strong>
      <div style="display:grid;gap:9px;margin-top:12px;">
        ${steps.map(([label, step]) => {
          const icon = step.status === 'Approved' ? '✅' : step.status === 'Rejected' ? '❌' : step.status === 'Pending' ? '⏳' : '🔒'
          const text = step.status === 'Waiting' ? 'Waiting' : step.status
          return `<div style="display:flex;justify-content:space-between;gap:15px;padding:9px 0;border-bottom:1px solid #e2e8f0;"><span>${icon} ${label}</span><strong>${text}</strong></div>`
        }).join('')}
      </div>
    </div>
  `
}

/* =========================================================
   COMMON HELPERS
   ========================================================= */

function pageHeader(
  title: string,
  backAction: string = ''
): string {
  return `
    <header class="dashboard-header">
      <h1>${title}</h1>

      <div style="
        display:flex;
        gap:10px;
        align-items:center;
      ">
        ${
          backAction
            ? `
              <button
                id="headerBackBtn"
                class="logout-btn"
                style="background:#2563eb;"
              >
                ← Back
              </button>
            `
            : ''
        }

        <button id="logoutBtn" class="logout-btn">
          Logout
        </button>
      </div>
    </header>
  `
}

function attachLogout() {
  const logoutBtn = document.querySelector('#logoutBtn')

  if (logoutBtn) {
    logoutBtn.addEventListener('click', showRoleSelection)
  }
}

function attachBack(callback: () => void) {
  const backBtn = document.querySelector('#headerBackBtn')

  if (backBtn) {
    backBtn.addEventListener('click', callback)
  }
}

function showMessage(
  elementId: string,
  message: string,
  success = false
) {
  const element = document.querySelector(
    `#${elementId}`
  ) as HTMLElement | null

  if (!element) return

  element.textContent = message
  element.style.marginTop = '15px'
  element.style.fontWeight = '600'
  element.style.color = success ? '#15803d' : '#dc2626'
}

/* =========================================================
   ROLE SELECTION
   ========================================================= */

function showRoleSelection() {
  currentUser = null

  app.innerHTML = `
    <div class="app">
      <div class="login-card">

        <div class="logo">🎓</div>

        <h1 style="
          font-weight:900;
          line-height:1.25;
          margin-bottom:12px;
        ">
          Welcome to NSM_EOD : A Digital On Duty Platform
        </h1>

        <p class="subtitle">
          Who are you?
        </p>

        <button
          id="studentBtn"
          class="role-btn student-btn"
        >
          🎓 Student
        </button>

        <button
          id="staffBtn"
          class="role-btn staff-btn"
        >
          👤 Staff
        </button>

        <p style="
          margin:20px 0 0;
          text-align:center;
          font-size:13px;
          font-weight:600;
          color:#64748b;
        ">
          © 2026 Dora Hasini's NSM EOD. All Rights Reserved.
        </p>

      </div>
    </div>
  `

  document
    .querySelector('#studentBtn')!
    .addEventListener('click', () => showLogin('student'))

  document
    .querySelector('#staffBtn')!
    .addEventListener('click', () => showLogin('staff'))
}

/* =========================================================
   LOGIN
   ========================================================= */

function showLogin(type: UserType) {
  const title =
    type === 'student'
      ? 'Student Login'
      : 'Staff Login'

  const label =
    type === 'student'
      ? 'Register Number'
      : 'Staff ID'

  const icon =
    type === 'student'
      ? '🎓'
      : '👤'

  app.innerHTML = `
    <div class="app">

      <div class="login-card">

        <div class="logo">
          ${icon}
        </div>

        <h1>${title}</h1>

        <p class="subtitle">
          Sign in to continue
        </p>

        <input
          id="username"
          class="login-input"
          type="text"
          placeholder="${label}"
        />

        <input
          id="password"
          class="login-input"
          type="password"
          placeholder="Password"
        />

        <button
          id="loginBtn"
          class="role-btn student-btn"
        >
          LOGIN
        </button>

        <button
          id="backBtn"
          class="back-btn"
        >
          ← Back
        </button>

        <p
          id="message"
          class="message"
        ></p>

      </div>

    </div>
  `

  document
    .querySelector('#backBtn')!
    .addEventListener('click', showRoleSelection)

  document
    .querySelector('#loginBtn')!
    .addEventListener('click', async () => {

      const username =
        (
          document.querySelector('#username') as HTMLInputElement
        ).value.trim()

      const password =
        (
          document.querySelector('#password') as HTMLInputElement
        ).value.trim()

      const message =
        document.querySelector('#message') as HTMLParagraphElement

      if (!username || !password) {
        message.textContent = 'Please enter all details'
        message.style.color = '#dc2626'
        return
      }

      message.textContent = 'Logging in...'
      message.style.color = '#64748b'

      const loginButton =
        document.querySelector('#loginBtn') as HTMLButtonElement

      loginButton.disabled = true

      try {
        const data =
          type === 'student'
            ? await studentLogin(username, password)
            : await staffLogin(username, password)

        console.log('LOGIN DATA:', data)

        if (type === 'student') {
          const student = data?.student ?? data?.user

          if (!student) {
            throw new Error(data?.message || 'Invalid login details')
          }

          message.textContent = 'Login successful!'
          message.style.color = '#15803d'

          currentUser = student

          setTimeout(() => {
            showStudentDashboard(student as Student)
          }, 300)
        } else {
          const staff = data?.staff ?? data?.user

          if (!staff) {
            throw new Error(data?.message || 'Invalid login details')
          }

          message.textContent = 'Login successful!'
          message.style.color = '#15803d'

          currentUser = staff

          setTimeout(() => {
            showStaffDashboard(staff as Staff)
          }, 300)
        }
      } catch (error) {
        loginButton.disabled = false

        message.textContent =
          error instanceof Error
            ? error.message
            : 'Unable to login. Please check your details.'

        message.style.color = '#dc2626'
        console.error('LOGIN ERROR:', error)
      }
    })

}

/* =========================================================
   STUDENT DASHBOARD
   ========================================================= */

function showStudentDashboard(student: Student) {
  app.innerHTML = `
    <div class="dashboard">

      ${pageHeader('Student Dashboard')}

      <main class="dashboard-content">

        <h2>
          Welcome, ${student.name}
        </h2>

        <div class="student-info">

          <div class="info-card">
            <span>🎓</span>
            <div>
              <small>Register Number</small>
              <strong>${student.register_no}</strong>
            </div>
          </div>

          <div class="info-card">
            <span>🏫</span>
            <div>
              <small>Department</small>
              <strong>${student.department}</strong>
            </div>
          </div>

          <div class="info-card">
            <span>📅</span>
            <div>
              <small>Year</small>
              <strong>${student.year}</strong>
            </div>
          </div>

          <div class="info-card">
            <span>📚</span>
            <div>
              <small>Semester</small>
              <strong>${student.semester}</strong>
            </div>
          </div>

          <div class="info-card">
            <span>👥</span>
            <div>
              <small>Section</small>
              <strong>${student.section}</strong>
            </div>
          </div>

        </div>

        <div class="dashboard-actions">

          <button id="applyODBtn">
            📝 Apply OD
          </button>

          <button id="historyBtn">
            📋 OD History
          </button>

          <button id="settingsBtn">
            ⚙️ Student Settings
          </button>

          <button id="passwordBtn">
            🔐 Change Password
          </button>

          <button id="notificationBtn">
            🔔 Notifications
          </button>

        </div>

      </main>

    </div>
  `

  attachLogout()

  document
    .querySelector('#applyODBtn')!
    .addEventListener('click', () =>
      showApplyOD(student)
    )

  document
    .querySelector('#historyBtn')!
    .addEventListener('click', () =>
      showODHistory(student)
    )

  document
    .querySelector('#settingsBtn')!
    .addEventListener('click', () =>
      showStaffSettings(student)
    )

  document
    .querySelector('#passwordBtn')!
    .addEventListener('click', () =>
      showChangePassword(
        () => showStudentDashboard(student)
      )
    )

  document
    .querySelector('#notificationBtn')!
    .addEventListener('click', () =>
      showNotifications(
        () => showStudentDashboard(student)
      )
    )
}

/* =========================================================
   APPLY OD
   ========================================================= */

function showApplyOD(student: Student) {
  app.innerHTML = `
    <div class="dashboard">

      ${pageHeader('Apply OD', 'studentDashboard')}

      <main class="dashboard-content">

        <h2>Apply for On-Duty</h2>

        <div style="
          background:white;
          padding:30px;
          border-radius:18px;
          max-width:800px;
          box-shadow:0 8px 25px rgba(0,0,0,0.08);
        ">

          <label>Student Name</label>
          <input id="studentName" type="text" class="login-input" placeholder="Enter student name" />

          <label>Class / Year</label>
          <input id="studentYear" type="text" class="login-input" placeholder="Enter class / year" />

          <label>Section</label>
          <input id="studentSection" type="text" class="login-input" placeholder="Enter section" />

          <div style="
            display:grid;
            grid-template-columns:1fr 1fr;
            gap:18px;
          ">

            <div>
              <label>From Date</label>
              <input id="fromDate" type="date" class="login-input" />
            </div>

            <div>
              <label>To Date</label>
              <input id="toDate" type="date" class="login-input" />
            </div>

          </div>

          <div style="
            display:grid;
            grid-template-columns:1fr 1fr;
            gap:18px;
            margin-top:5px;
          ">

            <div>
              <label>From Time</label>
              <input id="fromTime" type="time" class="login-input" />
            </div>

            <div>
              <label>To Time</label>
              <input id="toTime" type="time" class="login-input" />
            </div>

          </div>

          <label>Event / Program</label>
          <input id="odEvent" type="text" class="login-input" placeholder="Enter event name" />

          <label>Venue</label>
          <input id="odVenue" type="text" class="login-input" placeholder="Enter venue" />

          <label>Link</label>
          <input
            id="odLink"
            type="url"
            class="login-input"
            placeholder="Paste event / GForm / website link"
          />

          <label>Reason</label>
          <textarea id="odReason" class="login-input" rows="4" placeholder="Enter reason for OD" style="resize:vertical;"></textarea>

          <button id="submitODBtn" class="role-btn student-btn">
            📝 Submit OD Request
          </button>

          <p id="odMessage"></p>

        </div>

      </main>

    </div>
  `

  attachLogout()
  attachBack(() => showStudentDashboard(student))

  document.querySelector('#fromDate')!
    .addEventListener('change', () => {
      const fromDate =
        (document.querySelector('#fromDate') as HTMLInputElement).value
      const toDate =
        document.querySelector('#toDate') as HTMLInputElement

      if (fromDate) toDate.min = fromDate
    })

  document.querySelector('#submitODBtn')!
    .addEventListener('click', async () => {
      const studentName =
        (document.querySelector('#studentName') as HTMLInputElement).value.trim()
      const studentYear =
        (document.querySelector('#studentYear') as HTMLInputElement).value.trim()
      const studentSection =
        (document.querySelector('#studentSection') as HTMLInputElement).value.trim()

      const fromDate =
        (document.querySelector('#fromDate') as HTMLInputElement).value
      const toDate =
        (document.querySelector('#toDate') as HTMLInputElement).value
      const fromTime =
        (document.querySelector('#fromTime') as HTMLInputElement).value
      const toTime =
        (document.querySelector('#toTime') as HTMLInputElement).value
      const event =
        (document.querySelector('#odEvent') as HTMLInputElement).value.trim()
      const venue =
        (document.querySelector('#odVenue') as HTMLInputElement).value.trim()
      const reason =
        (document.querySelector('#odReason') as HTMLTextAreaElement).value.trim()
      const link =
        (document.querySelector('#odLink') as HTMLInputElement).value.trim()

      if (!student.id) {
        showMessage('odMessage', 'Student ID is missing. Please login again.')
        return
      }

      if (!studentName || !studentYear || !studentSection || !fromDate || !toDate || !fromTime || !toTime || !event || !venue || !link || !reason) {
        showMessage('odMessage', 'Please fill all required details.')
        return
      }

      if (toDate < fromDate) {
        showMessage('odMessage', 'To Date cannot be before From Date.')
        return
      }

      if (fromDate === toDate && toTime <= fromTime) {
        showMessage('odMessage', 'To Time must be after From Time.')
        return
      }

      const from = new Date(`${fromDate}T00:00:00`)
      const to = new Date(`${toDate}T00:00:00`)
      const noOfDays =
        Math.floor((to.getTime() - from.getTime()) / 86400000) + 1

      const submitButton =
        document.querySelector('#submitODBtn') as HTMLButtonElement
      submitButton.disabled = true
      submitButton.textContent = 'Submitting...'

      try {
        const result = await applyOD({
          student: Number(student.id),
          event_name: event,
          event_type: 'General',
          location: venue,
          from_date: fromDate,
          to_date: toDate,
          from_time: fromTime,
          to_time: toTime,
          no_of_days: noOfDays,
          reason,
          poster_link: link,
          student_name: studentName,
          student_year: studentYear,
          student_section: studentSection
        } as any)

        console.log('OD SUBMIT RESPONSE:', result)

        const createdRequestId = Number(result?.id ?? result?.request?.id ?? result?.od_request?.id)
        if (createdRequestId) {
          const tracking = createApprovalTracking(Number(student.id))
          if (tracking) {
            const allTracking = readODApprovalTracking()
            allTracking[String(createdRequestId)] = tracking
            writeODApprovalTracking(allTracking)
          }
        }

        showMessage(
          'odMessage',
          result?.message || 'OD request submitted successfully!',
          true
        )

        setTimeout(() => showODHistory(student), 700)
      } catch (error) {
        console.error('OD SUBMIT ERROR:', error)
        showMessage(
          'odMessage',
          error instanceof Error
            ? error.message
            : 'Unable to submit OD request.'
        )
        submitButton.disabled = false
        submitButton.textContent = '📝 Submit OD Request'
      }
    })
}

/* =========================================================
   OD HISTORY
   ========================================================= */

function normalizeODRequest(request: any): ODRequest {
  return {
    id: Number(request.id),
    fromDate: request.fromDate ?? request.from_date ?? '',
    toDate: request.toDate ?? request.to_date ?? '',
    fromTime: request.fromTime ?? request.from_time ?? '09:00',
    toTime: request.toTime ?? request.to_time ?? '17:00',
    event: request.event ?? request.event_name ?? '',
    venue: request.venue ?? request.location ?? '',
    status: request.status ?? 'Pending',
    reason: request.reason ?? '',
    link: request.link ?? request.poster_link ?? '',
    studentName: request.studentName ?? request.student_name ?? '',
    studentYear: request.studentYear ?? request.student_year ?? '',
    studentSection: request.studentSection ?? request.student_section ?? '',
    studentId: Number(request.studentId ?? request.student_id ?? request.student ?? 0) || undefined,
    approval: request.approval ?? request.approvals ?? undefined
  }
}

async function showODHistory(student: Student) {
  app.innerHTML = `
    <div class="dashboard">
      ${pageHeader('OD History', 'studentDashboard')}
      <main class="dashboard-content">
        <h2>Your OD Requests</h2>
        <div style="background:white;padding:40px;border-radius:18px;text-align:center;margin-top:25px;">
          Loading OD history...
        </div>
      </main>
    </div>
  `

  attachLogout()
  attachBack(() => showStudentDashboard(student))

  if (!student.id) {
    showMessage('odHistoryMessage', 'Student ID is missing. Please login again.')
    return
  }

  try {
    const response = await getODHistory(Number(student.id))
    const rawRequests = Array.isArray(response)
      ? response
      : response?.requests ?? response?.history ?? response?.data ?? []
    const requests = rawRequests.map(normalizeODRequest)

    requests.forEach((request: any) => {
      const tracking = getApprovalTracking(request)
      if (tracking) request.approval = tracking
      const allApproved = tracking && nextApprovalRole(tracking) === 'completed'
      if (allApproved) request.status = 'Approved'
    })

    app.innerHTML = `
      <div class="dashboard">
        ${pageHeader('OD History', 'studentDashboard')}
        <main class="dashboard-content">
          <h2>Your OD Requests</h2>

          <div style="display:grid;gap:18px;margin-top:25px;">
            ${requests.length === 0
              ? `
                <div style="background:white;padding:40px;border-radius:18px;text-align:center;">
                  <h3>No OD requests found</h3>
                </div>
              `
              : requests.map((request: any) => `
                <div style="background:white;padding:25px;border-radius:18px;">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:15px;flex-wrap:wrap;">
                    <div>
                      <h3 style="margin:0 0 8px;">${request.event}</h3>
                      <p style="margin:5px 0;">📅 ${request.fromDate} → ${request.toDate}</p>
                      <p style="margin:5px 0;">⏰ ${request.fromTime} - ${request.toTime}</p>
                      <p style="margin:5px 0;">📍 ${request.venue}</p>
                      ${request.link ? `<p style="margin:5px 0;">🔗 <a href="${request.link}" target="_blank" rel="noopener noreferrer">Event / Application Link</a></p>` : ''}
                      <p style="margin:5px 0;">📝 ${request.reason}</p>
                      ${approvalTrackingHTML(getApprovalTracking(request))}
                    </div>
                    <span style="
                      padding:8px 16px;
                      border-radius:20px;
                      font-weight:700;
                      background:${request.status === 'Approved' ? '#dcfce7' : request.status === 'Rejected' ? '#fee2e2' : '#fef3c7'};
                      color:${request.status === 'Approved' ? '#166534' : request.status === 'Rejected' ? '#991b1b' : '#92400e'};
                    ">${request.status}</span>
                  </div>
                </div>
              `).join('')}
          </div>
        </main>
      </div>
    `

    attachLogout()
    attachBack(() => showStudentDashboard(student))
  } catch (error) {
    console.error('OD HISTORY ERROR:', error)
    app.innerHTML = `
      <div class="dashboard">
        ${pageHeader('OD History', 'studentDashboard')}
        <main class="dashboard-content">
          <h2>Your OD Requests</h2>
          <div style="background:#fff7ed;border:1px solid #fed7aa;padding:25px;border-radius:18px;color:#9a3412;margin-top:25px;">
            Unable to load OD history. Please check that the backend is running.
          </div>
        </main>
      </div>
    `
    attachLogout()
    attachBack(() => showStudentDashboard(student))
  }
}

/* =========================================================
   STUDENT SETTINGS
   ========================================================= */

async function showStaffSettings(student: Student) {
  app.innerHTML = `
    <div class="dashboard">

      ${pageHeader('Student Settings', 'studentDashboard')}

      <main class="dashboard-content">

        <h2>⚙️ Student Settings</h2>

        <div id="staffSettingsContent" style="
          background:white;
          padding:30px;
          border-radius:18px;
          max-width:800px;
          box-shadow:0 6px 20px rgba(0,0,0,0.07);
        ">
          <p style="color:#64748b;">
            Loading CSE department staff...
          </p>
        </div>

      </main>

    </div>
  `

  attachLogout()
  attachBack(() => showStudentDashboard(student))

  const content =
    document.querySelector('#staffSettingsContent') as HTMLElement

  if (!student.id) {
    content.innerHTML = `
      <div style="
        background:#fff7ed;
        border:1px solid #fed7aa;
        padding:25px;
        border-radius:16px;
        color:#9a3412;
      ">
        Student ID is missing. Please login again.
      </div>
    `
    return
  }

  try {
    const response = await getAllStaff()
    const rawStaff = Array.isArray(response)
      ? response
      : response?.staff ?? response?.data ?? []

    const cseStaff: Staff[] = rawStaff
      .filter((staff: any) =>
        String(staff.department ?? '').toUpperCase() === 'CSE'
      )
      .map((staff: any) => ({
        id: Number(staff.id),
        name: String(staff.name ?? ''),
        staff_id: String(staff.staff_id ?? ''),
        department: String(staff.department ?? ''),
        designation: String(staff.designation ?? '')
      }))
      .filter((staff: Staff) => staff.name && staff.id)

    const hod = cseStaff.find(
      staff => staff.designation.toUpperCase() === 'HOD'
    )

    if (!hod) {
      content.innerHTML = `
        <div style="
          background:#fff7ed;
          border:1px solid #fed7aa;
          padding:25px;
          border-radius:16px;
          color:#9a3412;
        ">
          HOD for the CSE department could not be found in the staff list.
        </div>
      `
      return
    }

    const staffOptions = (
      placeholder: string,
      selectedId = ''
    ) => `
      <option value="">${placeholder}</option>
      ${cseStaff.map(staff => `
        <option value="${staff.id}" ${String(staff.id) === selectedId ? 'selected' : ''}>
          ${staff.name} - ${staff.designation}
        </option>
      `).join('')}
    `

    content.innerHTML = `
      <div style="display:grid;gap:20px;">

        <div>
          <label>Student Year</label>
          <select id="studentYear" class="login-input">
            <option value="">Select Year</option>
            <option value="1" ${student.year === '1' ? 'selected' : ''}>1st Year</option>
            <option value="2" ${student.year === '2' ? 'selected' : ''}>2nd Year</option>
            <option value="3" ${student.year === '3' ? 'selected' : ''}>3rd Year</option>
            <option value="4" ${student.year === '4' ? 'selected' : ''}>4th Year</option>
          </select>
        </div>

        <div>
          <label>Semester Number</label>
          <select id="studentSemester" class="login-input"></select>
        </div>

        <div>
          <label>Event Coordinator</label>
          <select id="eventCoordinator" class="login-input">
            ${staffOptions('Select Event Coordinator')}
          </select>
        </div>

        <div>
          <label>Tutor</label>
          <select id="tutor" class="login-input">
            ${staffOptions('Select Tutor')}
          </select>
        </div>

        <div>
          <label>Year Incharge</label>
          <select id="yearIncharge" class="login-input">
            ${staffOptions('Select Year Incharge')}
          </select>
        </div>

        <div>
          <label>HOD</label>
          <select id="hod" class="login-input" disabled>
            <option value="${hod.id}" selected>
              ${hod.name} - HOD
            </option>
          </select>
          <small style="display:block;margin-top:6px;color:#64748b;">
            HOD is fixed for the CSE department.
          </small>
        </div>

        <button
          id="saveStudentSettings"
          class="role-btn student-btn"
        >
          💾 Save Student Settings
        </button>

        <p id="settingsMessage"></p>

      </div>
    `

    const yearSelect =
      document.querySelector('#studentYear') as HTMLSelectElement
    const semesterSelect =
      document.querySelector('#studentSemester') as HTMLSelectElement

    const updateSemesterOptions = () => {
      const semesterMap: Record<string, string[]> = {
        '1': ['1', '2'],
        '2': ['3', '4'],
        '3': ['5', '6'],
        '4': ['7', '8']
      }

      const semesters = semesterMap[yearSelect.value] ?? []
      semesterSelect.innerHTML = `
        <option value="">Select Semester</option>
        ${semesters.map(semester => `<option value="${semester}">Semester ${semester}</option>`).join('')}
      `

      if (semesters.includes(student.semester)) {
        semesterSelect.value = student.semester
      }
    }

    updateSemesterOptions()
    yearSelect.addEventListener('change', updateSemesterOptions)

    document
      .querySelector('#saveStudentSettings')!
      .addEventListener('click', async () => {
        const eventCoordinator =
          (document.querySelector('#eventCoordinator') as HTMLSelectElement).value
        const tutor =
          (document.querySelector('#tutor') as HTMLSelectElement).value
        const yearIncharge =
          (document.querySelector('#yearIncharge') as HTMLSelectElement).value
        const year = yearSelect.value
        const semester = semesterSelect.value

        if (!eventCoordinator || !tutor || !yearIncharge || !year || !semester) {
          showMessage(
            'settingsMessage',
            'Please select Event Coordinator, Tutor and Year Incharge.'
          )
          return
        }

        const saveButton =
          document.querySelector('#saveStudentSettings') as HTMLButtonElement

        saveButton.disabled = true
        saveButton.textContent = 'Saving...'

        try {
          const result = await saveStudentSettings({
            student: Number(student.id),
            event_coordinator: Number(eventCoordinator),
            tutor: Number(tutor),
            year_incharge: Number(yearIncharge),
            hod: Number(hod.id)
          })

          saveStudentSettingsLocally(Number(student.id), {
            event_coordinator: Number(eventCoordinator),
            tutor: Number(tutor),
            year_incharge: Number(yearIncharge),
            hod: Number(hod.id),
            year,
            semester
          })

          student.year = year
          student.semester = semester

          showMessage(
            'settingsMessage',
            result?.message || 'Student settings saved successfully!',
            true
          )
        } catch (error) {
          console.error('STAFF SETTINGS ERROR:', error)
          showMessage(
            'settingsMessage',
            error instanceof Error
              ? error.message
              : 'Unable to save staff settings.'
          )
        } finally {
          saveButton.disabled = false
          saveButton.textContent = '💾 Save Student Settings'
        }
      })
  } catch (error) {
    console.error('STAFF LIST ERROR:', error)
    content.innerHTML = `
      <div style="
        background:#fff7ed;
        border:1px solid #fed7aa;
        padding:25px;
        border-radius:16px;
        color:#9a3412;
      ">
        Unable to load the CSE department staff list. Please check that the backend is running.
      </div>
    `
  }
}


/* =========================================================
   CHANGE PASSWORD
   ========================================================= */

function showChangePassword(
  backCallback: () => void
) {
  app.innerHTML = `
    <div class="dashboard">

      ${pageHeader('Change Password')}

      <main class="dashboard-content">

        <h2>🔐 Change Password</h2>

        <div style="
          background:white;
          padding:30px;
          border-radius:18px;
          max-width:600px;
          box-shadow:0 6px 20px rgba(0,0,0,0.07);
        ">

          <label>Current Password</label>

          <input
            id="currentPassword"
            type="password"
            class="login-input"
            placeholder="Enter current password"
          />

          <label>New Password</label>

          <input
            id="newPassword"
            type="password"
            class="login-input"
            placeholder="Enter new password"
          />

          <label>Confirm New Password</label>

          <input
            id="confirmPassword"
            type="password"
            class="login-input"
            placeholder="Confirm new password"
          />

          <button
            id="changePasswordBtn"
            class="role-btn student-btn"
          >
            🔐 Change Password
          </button>

          <p id="passwordMessage"></p>

        </div>

      </main>

    </div>
  `

  attachLogout()

  /*
    IMPORTANT:
    This back button always returns to
    whichever dashboard opened this page.
  */
  const backButton =
    document.querySelector('#headerBackBtn')

  if (backButton) {
    backButton.addEventListener(
      'click',
      backCallback
    )
  }

  document
    .querySelector('#changePasswordBtn')!
    .addEventListener('click', () => {

      const current =
        (
          document.querySelector(
            '#currentPassword'
          ) as HTMLInputElement
        ).value

      const newPassword =
        (
          document.querySelector(
            '#newPassword'
          ) as HTMLInputElement
        ).value

      const confirm =
        (
          document.querySelector(
            '#confirmPassword'
          ) as HTMLInputElement
        ).value

      if (!current || !newPassword || !confirm) {
        showMessage(
          'passwordMessage',
          'Please fill all fields.'
        )
        return
      }

      if (newPassword.length < 6) {
        showMessage(
          'passwordMessage',
          'New password must contain at least 6 characters.'
        )
        return
      }

      if (newPassword !== confirm) {
        showMessage(
          'passwordMessage',
          'New passwords do not match.'
        )
        return
      }

      showMessage(
        'passwordMessage',
        'Password changed successfully!',
        true
      )

      setTimeout(() => {
        backCallback()
      }, 800)
    })
}


/* =========================================================
   NOTIFICATIONS
   ========================================================= */

function showNotifications(
  backCallback: () => void
) {
  const notifications = [
    {
      title: 'OD Request Approved',
      message:
        'Your Smart India Hackathon OD request has been approved.',
      time: 'Today'
    },
    {
      title: 'OD Request Pending',
      message:
        'Your Technical Symposium OD request is still pending.',
      time: '2 days ago'
    },
    {
      title: 'Welcome',
      message:
        'Welcome to the EOD Management System.',
      time: '5 days ago'
    }
  ]

  app.innerHTML = `
    <div class="dashboard">

      ${pageHeader('Notifications', 'back')}

      <main class="dashboard-content">

        <h2>🔔 Notifications</h2>

        <div style="
          display:grid;
          gap:15px;
          margin-top:25px;
        ">

          ${notifications
            .map(
              notification => `
                <div style="
                  background:white;
                  padding:22px;
                  border-radius:16px;
                  box-shadow:0 5px 18px rgba(0,0,0,0.06);
                  border-left:5px solid #2563eb;
                ">

                  <div style="
                    display:flex;
                    justify-content:space-between;
                    gap:15px;
                  ">

                    <strong>
                      ${notification.title}
                    </strong>

                    <small style="
                      color:#64748b;
                    ">
                      ${notification.time}
                    </small>

                  </div>

                  <p style="
                    margin:10px 0 0;
                    color:#475569;
                  ">
                    ${notification.message}
                  </p>

                </div>
              `
            )
            .join('')}

        </div>

      </main>

    </div>
  `

  attachLogout()
  attachBack(backCallback)
}


/* =========================================================
   STAFF DASHBOARD
   ========================================================= */

function showStaffDashboard(staff: Staff) {

  app.innerHTML = `
    <div class="dashboard">

      ${pageHeader('Staff Dashboard')}

      <main class="dashboard-content">

        <div style="
          margin-bottom:30px;
        ">

          <h2>
            Welcome, ${staff.name}
          </h2>

          <p style="
            color:#64748b;
          ">
            ${staff.designation} •
            ${staff.department}
          </p>

        </div>


        <div class="student-info">

          <div class="info-card">
            <span>👤</span>

            <div>
              <small>Staff ID</small>
              <strong>${staff.staff_id}</strong>
            </div>
          </div>


          <div class="info-card">
            <span>🏫</span>

            <div>
              <small>Department</small>
              <strong>${staff.department}</strong>
            </div>
          </div>


          <div class="info-card">
            <span>💼</span>

            <div>
              <small>Designation</small>
              <strong>${staff.designation}</strong>
            </div>
          </div>

        </div>


        <div class="dashboard-actions">

          <button id="pendingODBtn">
            📋 Pending OD Requests
          </button>

          <button id="classODStaffBtn">
            👥 Class OD
          </button>

          <button id="staffPasswordBtn">
            🔐 Change Password
          </button>

          <button id="staffNotificationsBtn">
            🔔 Notifications
          </button>

        </div>

      </main>

    </div>
  `

  attachLogout()


  document
    .querySelector('#pendingODBtn')!
    .addEventListener(
      'click',
      () => showPendingODRequests(staff)
    )


  document
    .querySelector('#classODStaffBtn')!
    .addEventListener(
      'click',
      () => showStaffClassOD(staff)
    )


  document
    .querySelector('#staffPasswordBtn')!
    .addEventListener(
      'click',
      () =>
        showChangePassword(
          () => showStaffDashboard(staff)
        )
    )


  document
    .querySelector('#staffNotificationsBtn')!
    .addEventListener(
      'click',
      () =>
        showNotifications(
          () => showStaffDashboard(staff)
        )
    )
}


/* =========================================================
   PENDING OD REQUESTS
   ========================================================= */

async function showPendingODRequests(staff: Staff) {
  app.innerHTML = `
    <div class="dashboard">
      ${pageHeader('Pending OD Requests', 'staffDashboard')}
      <main class="dashboard-content">
        <h2>📋 Pending OD Requests</h2>
        <div style="background:white;padding:40px;border-radius:18px;text-align:center;margin-top:25px;">
          Loading pending requests...
        </div>
      </main>
    </div>
  `

  attachLogout()
  attachBack(() => showStaffDashboard(staff))

  if (!staff.id) {
    app.querySelector('.dashboard-content')!.innerHTML += `
      <p style="color:#dc2626;">Staff ID is missing. Please login again.</p>
    `
    return
  }

  try {
    const response = await getPendingRequests(Number(staff.id))
    const rawRequests = Array.isArray(response)
      ? response
      : response?.requests ?? response?.pendingRequests ?? response?.data ?? []
    const pendingRequests = rawRequests
      .map(normalizeODRequest)
      .filter((request:any) => {
        const tracking = getApprovalTracking(request)
        if (!tracking) return true
        const role = nextApprovalRole(tracking)
        if (role === 'completed') return false
        const roleStep = role ? tracking[role] : null
        return !!roleStep && roleStep.staffId === Number(staff.id) && roleStep.status === 'Pending'
      })

    app.innerHTML = `
      <div class="dashboard">
        ${pageHeader('Pending OD Requests', 'staffDashboard')}
        <main class="dashboard-content">
          <h2>📋 Pending OD Requests</h2>

          ${pendingRequests.length === 0
            ? `
              <div style="background:white;padding:45px;border-radius:18px;text-align:center;margin-top:25px;">
                <div style="font-size:45px;">✅</div>
                <h3>No Pending Requests</h3>
                <p style="color:#64748b;">There are no OD requests waiting for approval.</p>
              </div>
            `
            : `
              <div style="display:grid;gap:18px;margin-top:25px;">
                ${pendingRequests.map((request: any) => `
                  <div style="background:white;padding:25px;border-radius:18px;box-shadow:0 5px 18px rgba(0,0,0,0.07);">
                    <div style="display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;">
                      <div>
                        <h3 style="margin-top:0;">${request.event}</h3>
                        <p>👤 <strong>Student Name:</strong> ${request.studentName || '-'}</p>
                        <p>🎓 <strong>Class / Year:</strong> ${request.studentYear || '-'}</p>
                        <p>👥 <strong>Section:</strong> ${request.studentSection || '-'}</p>
                        <p>📅 ${request.fromDate} → ${request.toDate}</p>
                        <p>⏰ ${request.fromTime} - ${request.toTime}</p>
                        <p>📍 ${request.venue}</p>
                        <p>📝 ${request.reason}</p>
                        ${approvalTrackingHTML(getApprovalTracking(request))}
                      </div>
                      <div style="display:flex;gap:10px;align-items:center;">
                        <button class="approve-btn" data-id="${request.id}">✓ Approve</button>
                        <button class="reject-btn" data-id="${request.id}">✕ Reject</button>
                      </div>
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
        </main>
      </div>
    `

    attachLogout()
    attachBack(() => showStaffDashboard(staff))

    document.querySelectorAll('.approve-btn').forEach(button => {
      button.addEventListener('click', async () => {
        await handleODDecision(staff, Number((button as HTMLElement).dataset.id), 'Approved')
      })
    })

    document.querySelectorAll('.reject-btn').forEach(button => {
      button.addEventListener('click', async () => {
        await handleODDecision(staff, Number((button as HTMLElement).dataset.id), 'Rejected')
      })
    })
  } catch (error) {
    console.error('PENDING OD ERROR:', error)
    app.innerHTML = `
      <div class="dashboard">
        ${pageHeader('Pending OD Requests', 'staffDashboard')}
        <main class="dashboard-content">
          <h2>📋 Pending OD Requests</h2>
          <div style="background:#fff7ed;border:1px solid #fed7aa;padding:25px;border-radius:18px;color:#9a3412;margin-top:25px;">
            Unable to load pending OD requests. Please check that the backend is running.
          </div>
        </main>
      </div>
    `
    attachLogout()
    attachBack(() => showStaffDashboard(staff))
  }
}

async function handleODDecision(
  staff: Staff,
  requestId: number,
  action: 'Approved' | 'Rejected'
) {
  if (!staff.id || !requestId) {
    alert('Invalid staff or OD request ID.')
    return
  }

  try {
    const existingTracking = readODApprovalTracking()[String(requestId)] || null
    if (existingTracking) {
      const role = nextApprovalRole(existingTracking)
      const step = role && role !== 'completed' ? existingTracking[role] : null

      if (!step || step.staffId !== Number(staff.id) || step.status !== 'Pending') {
        alert('This OD request is not currently assigned to you.')
        return
      }
    }

    const result = await approveOD({
      request_id: requestId,
      staff_id: Number(staff.id),
      action
    })

    console.log('OD DECISION RESPONSE:', result)

    const tracking = applyApprovalDecision(requestId, Number(staff.id), action)
    if (tracking && nextApprovalRole(tracking) === 'completed') {
      console.log('FINAL OD STATUS: APPROVED')
    }

    await showPendingODRequests(staff)
  } catch (error) {
    console.error('OD DECISION ERROR:', error)
    alert(
      error instanceof Error
        ? error.message
        : 'Unable to update OD request.'
    )
  }
}

/* =========================================================
   STAFF - CLASS OD
   ========================================================= */

function showStaffClassOD(staff: Staff) {

  app.innerHTML = `
    <div class="dashboard">

      ${pageHeader(
        'Class OD',
        'staffDashboard'
      )}

      <main class="dashboard-content">

        <h2>
          👥 Class OD Details
        </h2>

        <p style="
          color:#64748b;
          margin-bottom:25px;
        ">
          Select the date, year and section to view
          students who are on approved OD.
        </p>


        <!-- FILTER CARD -->

        <div style="
          background:white;
          padding:25px;
          border-radius:18px;
          box-shadow:0 6px 20px rgba(0,0,0,0.07);
          margin-bottom:25px;
        ">

          <div style="
            display:grid;
            grid-template-columns:
              repeat(auto-fit,minmax(180px,1fr));
            gap:18px;
          ">

            <div>

              <label>
                Date
              </label>

              <input
                id="classODDate"
                type="date"
                class="login-input"
              />

            </div>


            <div>

              <label>
                Year
              </label>

              <select
                id="classODYear"
                class="login-input"
              >

                <option value="">
                  Select Year
                </option>

                <option value="1">
                  1st Year
                </option>

                <option value="2">
                  2nd Year
                </option>

                <option value="3">
                  3rd Year
                </option>

                <option value="4">
                  4th Year
                </option>

              </select>

            </div>


            <div>

              <label>
                Section
              </label>

              <select
                id="classODSection"
                class="login-input"
              >

                <option value="">
                  Select Section
                </option>

                <option value="A">
                  A
                </option>

                <option value="B">
                  B
                </option>

                <option value="C">
                  C
                </option>

              </select>

            </div>

          </div>


          <button
            id="viewClassODBtn"
            class="role-btn student-btn"
            style="
              margin-top:20px;
              max-width:250px;
            "
          >
            🔍 View OD Students
          </button>

        </div>


        <!-- RESULT AREA -->

        <div id="classODResult">

          <div style="
            background:white;
            padding:40px;
            border-radius:18px;
            text-align:center;
            color:#64748b;
          ">

            <div style="
              font-size:45px;
              margin-bottom:10px;
            ">
              👥
            </div>

            <h3>
              Select Date, Year and Section
            </h3>

            <p>
              Then click "View OD Students".
            </p>

          </div>

        </div>


      </main>

    </div>
  `


  attachLogout()

  attachBack(
    () => showStaffDashboard(staff)
  )


  /*
    VIEW CLASS OD
  */

  document
    .querySelector('#viewClassODBtn')!
    .addEventListener(
      'click',
      () => {

        const date =
          (
            document.querySelector(
              '#classODDate'
            ) as HTMLInputElement
          ).value


        const year =
          (
            document.querySelector(
              '#classODYear'
            ) as HTMLSelectElement
          ).value


        const section =
          (
            document.querySelector(
              '#classODSection'
            ) as HTMLSelectElement
          ).value


        const result =
          document.querySelector(
            '#classODResult'
          ) as HTMLElement


        /*
          VALIDATION
        */

        if (!date || !year || !section) {

          result.innerHTML = `
            <div style="
              background:#fff7ed;
              border:1px solid #fed7aa;
              padding:25px;
              border-radius:18px;
              color:#9a3412;
            ">

              <strong>
                ⚠️ Please select all three fields.
              </strong>

              <p style="margin-bottom:0;">
                Select Date, Year and Section.
              </p>

            </div>
          `

          return
        }


        /*
          FILTER ONLY APPROVED OD REQUESTS
        */

        const studentsOnOD =
          odRequests.filter(request => {

            const requestDate =
              date >= request.fromDate &&
              date <= request.toDate


            /*
              For the current demo data,
              Class OD is displayed for
              CSE 3rd Year Section A.
            */

            const isCorrectClass =
              year === '3' &&
              section === 'A'


            return (
              request.status === 'Approved' &&
              requestDate &&
              isCorrectClass
            )

          })


        /*
          NO STUDENTS
        */

        if (studentsOnOD.length === 0) {

          result.innerHTML = `
            <div style="
              background:white;
              padding:40px;
              border-radius:18px;
              text-align:center;
              box-shadow:
                0 5px 18px
                rgba(0,0,0,0.06);
            ">

              <div style="
                font-size:50px;
              ">
                ✅
              </div>

              <h3>
                No Students on OD
              </h3>

              <p style="
                color:#64748b;
              ">
                No approved OD students were found
                for the selected date and class.
              </p>

            </div>
          `

          return
        }


        /*
          RESULT
        */

        result.innerHTML = `

          <div style="
            background:white;
            padding:25px;
            border-radius:18px;
            box-shadow:
              0 5px 18px
              rgba(0,0,0,0.06);
          ">

            <!-- HEADER -->

            <div style="
              display:flex;
              justify-content:space-between;
              align-items:center;
              gap:15px;
              flex-wrap:wrap;
              margin-bottom:20px;
            ">

              <div>

                <h3 style="
                  margin:0;
                ">
                  👥 Students on OD
                </h3>

                <p style="
                  margin:6px 0 0;
                  color:#64748b;
                ">
                  ${date}
                  •
                  ${year === '1'
                    ? '1st'
                    : year === '2'
                    ? '2nd'
                    : year === '3'
                    ? '3rd'
                    : '4th'
                  } Year
                  •
                  Section ${section}
                </p>

              </div>


              <div style="
                background:#dcfce7;
                color:#166534;
                padding:10px 18px;
                border-radius:22px;
                font-weight:700;
              ">

                ${studentsOnOD.length}
                Student${studentsOnOD.length === 1 ? '' : 's'}

              </div>

            </div>


            <!-- STUDENT TABLE -->

            <div style="
              overflow-x:auto;
            ">

              <table style="
                width:100%;
                border-collapse:collapse;
              ">

                <thead>

                  <tr style="
                    background:#f8fafc;
                  ">

                    <th style="
                      padding:14px;
                      text-align:left;
                      border-bottom:1px solid #e2e8f0;
                    ">
                      #
                    </th>

                    <th style="
                      padding:14px;
                      text-align:left;
                      border-bottom:1px solid #e2e8f0;
                    ">
                      Register Number
                    </th>

                    <th style="
                      padding:14px;
                      text-align:left;
                      border-bottom:1px solid #e2e8f0;
                    ">
                      Student Name
                    </th>

                    <th style="
                      padding:14px;
                      text-align:left;
                      border-bottom:1px solid #e2e8f0;
                    ">
                      Event
                    </th>

                    <th style="
                      padding:14px;
                      text-align:left;
                      border-bottom:1px solid #e2e8f0;
                    ">
                      Venue
                    </th>

                    <th style="
                      padding:14px;
                      text-align:left;
                      border-bottom:1px solid #e2e8f0;
                    ">
                      Time
                    </th>

                  </tr>

                </thead>


                <tbody>

                  ${studentsOnOD
                    .map(
                      (request, index) => `

                        <tr>

                          <td style="
                            padding:14px;
                            border-bottom:
                              1px solid #f1f5f9;
                          ">
                            ${index + 1}
                          </td>


                          <td style="
                            padding:14px;
                            border-bottom:
                              1px solid #f1f5f9;
                            font-weight:600;
                          ">
                            ${
                              index === 0
                                ? '23CSE001'
                                : index === 1
                                ? '23CSE002'
                                : `23CSE${String(
                                    index + 1
                                  ).padStart(3, '0')}`
                            }
                          </td>


                          <td style="
                            padding:14px;
                            border-bottom:
                              1px solid #f1f5f9;
                            font-weight:600;
                          ">
                            ${
                              index === 0
                                ? 'Arun Kumar'
                                : index === 1
                                ? 'Priya S'
                                : `Student ${index + 1}`
                            }
                          </td>


                          <td style="
                            padding:14px;
                            border-bottom:
                              1px solid #f1f5f9;
                          ">
                            ${request.event}
                          </td>


                          <td style="
                            padding:14px;
                            border-bottom:
                              1px solid #f1f5f9;
                          ">
                            ${request.venue}
                          </td>


                          <td style="
                            padding:14px;
                            border-bottom:
                              1px solid #f1f5f9;
                          ">
                            ${request.fromTime}
                            -
                            ${request.toTime}
                          </td>

                        </tr>

                      `
                    )
                    .join('')}

                </tbody>

              </table>

            </div>

          </div>
        `
      }
    )
}


/* =========================================================
   STAFF NOTIFICATION PAGE
   ========================================================= */

function showStaffNotifications(
  staff: Staff
) {

  const notifications = [
    {
      title: 'New OD Request',
      message:
        'A new student OD request is waiting for approval.',
      time: 'Today'
    },
    {
      title: 'Class OD Updated',
      message:
        'Class OD information has been updated.',
      time: 'Yesterday'
    }
  ]


  app.innerHTML = `
    <div class="dashboard">

      ${pageHeader(
        'Notifications',
        'staffDashboard'
      )}

      <main class="dashboard-content">

        <h2>
          🔔 Notifications
        </h2>

        <div style="
          display:grid;
          gap:15px;
          margin-top:25px;
        ">

          ${notifications
            .map(
              notification => `
                <div style="
                  background:white;
                  padding:22px;
                  border-radius:16px;
                  border-left:
                    5px solid #2563eb;
                  box-shadow:
                    0 5px 18px
                    rgba(0,0,0,0.06);
                ">

                  <div style="
                    display:flex;
                    justify-content:
                      space-between;
                    gap:15px;
                  ">

                    <strong>
                      ${notification.title}
                    </strong>

                    <small style="
                      color:#64748b;
                    ">
                      ${notification.time}
                    </small>

                  </div>

                  <p style="
                    color:#475569;
                    margin-bottom:0;
                  ">
                    ${notification.message}
                  </p>

                </div>
              `
            )
            .join('')}

        </div>

      </main>

    </div>
  `


  attachLogout()

  attachBack(
    () => showStaffDashboard(staff)
  )
}


/* =========================================================
   UTILITY - EMPTY STATE
   ========================================================= */

function showEmptyState(
  title: string,
  message: string,
  backCallback: () => void
) {

  app.innerHTML = `
    <div class="dashboard">

      ${pageHeader(title)}

      <main class="dashboard-content">

        <div style="
          background:white;
          padding:50px;
          border-radius:18px;
          text-align:center;
          box-shadow:
            0 5px 18px
            rgba(0,0,0,0.06);
        ">

          <div style="
            font-size:50px;
          ">
            📭
          </div>

          <h3>
            ${title}
          </h3>

          <p style="
            color:#64748b;
          ">
            ${message}
          </p>

          <button
            id="emptyBackBtn"
            class="role-btn student-btn"
            style="max-width:180px;"
          >
            ← Back
          </button>

        </div>

      </main>

    </div>
  `


  attachLogout()


  document
    .querySelector('#emptyBackBtn')!
    .addEventListener(
      'click',
      backCallback
    )
}


/* =========================================================
   RESPONSIVE BACK BUTTON FALLBACK
   ========================================================= */

function ensureBackButton(
  callback: () => void
) {

  const header =
    document.querySelector(
      '.dashboard-header'
    )

  if (!header) return


  if (
    document.querySelector(
      '#headerBackBtn'
    )
  ) {
    return
  }


  const button =
    document.createElement('button')

  button.id = 'headerBackBtn'

  button.className = 'logout-btn'

  button.textContent = '← Back'

  button.style.background =
    '#2563eb'

  button.style.marginRight =
    '8px'

  button.addEventListener(
    'click',
    callback
  )


  const logout =
    document.querySelector(
      '#logoutBtn'
    )

  if (logout) {
    logout.parentElement?.insertBefore(
      button,
      logout
    )
  }
}
/* =========================================================
   APPLICATION START
   ========================================================= */

showRoleSelection()