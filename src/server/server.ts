import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// Load Supabase environment variables
dotenv.config({ path: 'src/services/.env' })

const app = express()

app.use(cors())
app.use(express.json())

// Supabase connection
const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase environment variables are missing')
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)


// ------------------------------------
// TEST ROUTE
// ------------------------------------

app.get('/', (_req, res) => {
  res.json({
    message: 'EOD Web Backend is running successfully!'
  })
})


// ------------------------------------
// STUDENT LOGIN
// ------------------------------------

app.post('/student/login/', async (req, res) => {

  const { register_no, password } = req.body

  console.log('STUDENT LOGIN:', register_no)

  const { data: student, error } = await supabase
    .from('od_student')
    .select('*')
    .eq('register_no', String(register_no))
    .eq('password', password)
    .single()

  if (error || !student) {
    return res.status(401).json({
      message: 'Invalid Register Number or Password'
    })
  }

  return res.json({
    student: {
      id: student.id,
      name: student.name,
      register_no: student.register_no,
      department: student.department,
      year: student.year,
      semester: student.semester,
      section: student.section
    }
  })
})


// ------------------------------------
// STAFF LOGIN
// ------------------------------------

app.post('/staff/login/', async (req, res) => {

  const { staff_id, password } = req.body

  console.log('STAFF LOGIN:', staff_id)

  const { data: staff, error } = await supabase
    .from('od_staff')
    .select('*')
    .eq('staff_id', String(staff_id))
    .eq('password', password)
    .single()

  if (error || !staff) {
    console.log('STAFF LOGIN FAILED:', error)

    return res.status(401).json({
      message: 'Invalid Staff ID or Password'
    })
  }

  console.log('STAFF FOUND:', staff.name)

  return res.json({
    staff: {
      id: staff.id,
      name: staff.name,
      staff_id: staff.staff_id,
      department: staff.department,
      designation: staff.designation
    }
  })
})


// ------------------------------------
// STUDENT - APPLY OD
// ------------------------------------

app.post('/student/apply-od/', async (req, res) => {
  try {
    const {
      student,
      event_name,
      event_type,
      location,
      from_date,
      to_date,
      no_of_days,
      reason,
      poster_link,
      student_name,
      student_year,
      student_section
    } = req.body

    console.log('APPLY OD:', {
      student,
      event_name,
      from_date,
      to_date
    })

    if (
      student === undefined ||
      !event_name ||
      !event_type ||
      !location ||
      !from_date ||
      !to_date ||
      no_of_days === undefined ||
      !reason ||
      !student_name ||
      !student_year ||
      !student_section
    ) {
      return res.status(400).json({
        message: 'Required OD details are missing'
      })
    }

    const { data, error } = await supabase
      .from('od_odrequest')
      .insert({
        student_id: Number(student),
        event_name: String(event_name),
        event_type: String(event_type),
        location: String(location),
        from_date: String(from_date),
        to_date: String(to_date),
        no_of_days: Number(no_of_days),
        reason: String(reason),
        status: 'Pending',
        created_at: new Date().toISOString(),
        poster_link: poster_link ? String(poster_link) : null,
        student_name: String(student_name).trim(),
        student_year: String(student_year).trim(),
        student_section: String(student_section).trim()
      })
      .select()
      .single()

    if (error) {
      console.error('APPLY OD SUPABASE ERROR:', error)
      return res.status(500).json({
        message: 'Failed to save OD request',
        error: error.message
      })
    }

    console.log('OD SAVED:', data)

    return res.status(201).json({
      message: 'OD request submitted successfully',
      request: data
    })
  } catch (error: any) {
    console.error('APPLY OD SERVER ERROR:', error)

    return res.status(500).json({
      message: error?.message || 'Failed to submit OD request'
    })
  }
})


// ------------------------------------
// STUDENT - OD HISTORY
// ------------------------------------

app.get('/student/history/:studentId/', async (req, res) => {
  try {
    const studentId = Number(req.params.studentId)

    if (!Number.isFinite(studentId)) {
      return res.status(400).json({
        message: 'Invalid student ID'
      })
    }

    const { data, error } = await supabase
      .from('od_odrequest')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('OD HISTORY SUPABASE ERROR:', error)
      return res.status(500).json({
        message: 'Failed to load OD history',
        error: error.message
      })
    }

    return res.json({
      requests: data || []
    })
  } catch (error: any) {
    console.error('OD HISTORY SERVER ERROR:', error)

    return res.status(500).json({
      message: error?.message || 'Failed to load OD history'
    })
  }
})


// ------------------------------------
// STAFF - PENDING OD REQUESTS
// ------------------------------------
// ------------------------------------
// STAFF - PENDING OD REQUESTS
// ------------------------------------

app.get('/staff/pending-requests/:staffId/', async (req, res) => {
  try {
    const staffId = Number(req.params.staffId)

    if (!Number.isFinite(staffId)) {
      return res.status(400).json({
        message: 'Invalid staff ID'
      })
    }

    // Load all student approval settings first.
    // We compare IDs using Number() so bigint/string/number differences
    // from Supabase cannot prevent the correct staff member from seeing
    // the request.
    const { data: settings, error: settingsError } = await supabase
      .from('od_studentsettings')
      .select(
        'student_id, event_coordinator_id, tutor_id, year_incharge_id, hod_id'
      )

    if (settingsError) {
      console.error('STUDENT SETTINGS SUPABASE ERROR:', settingsError)

      return res.status(500).json({
        message: 'Failed to load student approval settings',
        error: settingsError.message
      })
    }

    if (!settings || settings.length === 0) {
      return res.json({
        requests: []
      })
    }

    // Keep only settings belonging to this staff member in any role.
    const staffSettings = settings.filter(setting =>
      Number(setting.event_coordinator_id) === staffId ||
      Number(setting.tutor_id) === staffId ||
      Number(setting.year_incharge_id) === staffId ||
      Number(setting.hod_id) === staffId
    )

    if (staffSettings.length === 0) {
      return res.json({
        requests: []
      })
    }

    const studentIds = staffSettings.map(
      setting => Number(setting.student_id)
    )

    // Get OD requests belonging to those students.
    const { data: requests, error: requestError } = await supabase
      .from('od_odrequest')
      .select('*')
      .in('student_id', studentIds)
      .order('created_at', { ascending: false })

    if (requestError) {
      console.error('PENDING OD SUPABASE ERROR:', requestError)

      return res.status(500).json({
        message: 'Failed to load pending OD requests',
        error: requestError.message
      })
    }

    // IMPORTANT:
    // The request is shown ONLY to the staff member whose turn it is.
    // Coordinator -> Tutor -> Year Incharge -> HOD
    const pendingRequests = (requests || []).filter(request => {
      const setting = staffSettings.find(
        item => Number(item.student_id) === Number(request.student_id)
      )

      if (!setting) {
        return false
      }

      const status = String(request.status || '').trim()

      // Event Coordinator's turn
      if (
        status === 'Pending' &&
        Number(setting.event_coordinator_id) === staffId
      ) {
        return true
      }

      // Tutor's turn ONLY after Event Coordinator approval
      if (
        status === 'Coordinator Approved' &&
        Number(setting.tutor_id) === staffId
      ) {
        return true
      }

      // Year Incharge's turn ONLY after Tutor approval
      if (
        status === 'Tutor Approved' &&
        Number(setting.year_incharge_id) === staffId
      ) {
        return true
      }

      // HOD's turn ONLY after Year Incharge approval
      if (
        status === 'Year Incharge Approved' &&
        Number(setting.hod_id) === staffId
      ) {
        return true
      }

      return false
    })

    console.log('PENDING OD RESULT:', {
      staff_id: staffId,
      request_count: pendingRequests.length,
      request_ids: pendingRequests.map(request => request.id)
    })

    return res.json({
      requests: pendingRequests
    })

  } catch (error: any) {
    console.error('PENDING OD SERVER ERROR:', error)

    return res.status(500).json({
      message:
        error?.message ||
        'Failed to load pending OD requests'
    })
  }
})


// ------------------------------------
// STAFF - APPROVE / REJECT OD
// ------------------------------------

// ------------------------------------
// STAFF - APPROVE / REJECT OD
// ------------------------------------

app.post('/staff/approve/', async (req, res) => {
  try {
    const {
      request_id,
      staff_id,
      action
    } = req.body

    const normalizedAction =
      String(action || '').toLowerCase()

    const requestId = Number(request_id)
    const staffId = Number(staff_id)

    if (
      !Number.isFinite(requestId) ||
      !Number.isFinite(staffId)
    ) {
      return res.status(400).json({
        message: 'Invalid request ID or staff ID'
      })
    }

    if (
      normalizedAction !== 'approved' &&
      normalizedAction !== 'approve' &&
      normalizedAction !== 'rejected' &&
      normalizedAction !== 'reject'
    ) {
      return res.status(400).json({
        message: 'Action must be Approved or Rejected'
      })
    }

    // Get the OD request
    const { data: odRequest, error: requestError } =
      await supabase
        .from('od_odrequest')
        .select('*')
        .eq('id', requestId)
        .single()

    if (requestError || !odRequest) {
      console.error(
        'OD REQUEST LOOKUP ERROR:',
        requestError
      )

      return res.status(404).json({
        message: 'OD request not found'
      })
    }

    // Get approval settings for this student
    const { data: setting, error: settingsError } =
      await supabase
        .from('od_studentsettings')
        .select(
          'student_id, event_coordinator_id, tutor_id, year_incharge_id, hod_id'
        )
        .eq('student_id', odRequest.student_id)
        .single()

    if (settingsError || !setting) {
      console.error(
        'OD SETTINGS LOOKUP ERROR:',
        settingsError
      )

      return res.status(404).json({
        message: 'Student approval settings not found'
      })
    }

    console.log('OD APPROVAL CHECK:', {
      request_id: requestId,
      staff_id: staffId,
      current_status: odRequest.status,
      event_coordinator: setting.event_coordinator_id,
      tutor: setting.tutor_id,
      year_incharge: setting.year_incharge_id,
      hod: setting.hod_id
    })

    // ==================================================
    // REJECT
    // ==================================================

    if (
      normalizedAction === 'rejected' ||
      normalizedAction === 'reject'
    ) {

      let authorizedToReject = false

      if (
        odRequest.status === 'Pending' &&
        Number(setting.event_coordinator_id) === staffId
      ) {
        authorizedToReject = true
      }

      else if (
        odRequest.status === 'Coordinator Approved' &&
        Number(setting.tutor_id) === staffId
      ) {
        authorizedToReject = true
      }

      else if (
        odRequest.status === 'Tutor Approved' &&
        Number(setting.year_incharge_id) === staffId
      ) {
        authorizedToReject = true
      }

      else if (
        odRequest.status === 'Year Incharge Approved' &&
        Number(setting.hod_id) === staffId
      ) {
        authorizedToReject = true
      }

      if (!authorizedToReject) {
        return res.status(403).json({
          message:
            'You are not authorized to reject this OD request at this stage.'
        })
      }

      const { data, error } = await supabase
        .from('od_odrequest')
        .update({
          status: 'Rejected'
        })
        .eq('id', requestId)
        .select()
        .single()

      if (error) {
        console.error(
          'OD REJECT SUPABASE ERROR:',
          error
        )

        return res.status(500).json({
          message: 'Failed to reject OD request',
          error: error.message
        })
      }

      return res.json({
        message: 'OD request rejected successfully',
        request: data
      })
    }

    // ==================================================
    // APPROVE
    // ==================================================

    let newStatus = ''

    // Event Coordinator
    if (
      odRequest.status === 'Pending' &&
      Number(setting.event_coordinator_id) === staffId
    ) {
      newStatus = 'Coordinator Approved'
    }

    // Tutor
    else if (
      odRequest.status === 'Coordinator Approved' &&
      Number(setting.tutor_id) === staffId
    ) {
      newStatus = 'Tutor Approved'
    }

    // Year Incharge
    else if (
      odRequest.status === 'Tutor Approved' &&
      Number(setting.year_incharge_id) === staffId
    ) {
      newStatus = 'Year Incharge Approved'
    }

    // HOD - FINAL APPROVAL
    else if (
      odRequest.status === 'Year Incharge Approved' &&
      Number(setting.hod_id) === staffId
    ) {
      newStatus = 'Approved'
    }

    else {
      return res.status(403).json({
        message:
          'You are not authorized to approve this OD request at this stage.'
      })
    }

    console.log('OD STATUS CHANGE:', {
      request_id: requestId,
      old_status: odRequest.status,
      new_status: newStatus,
      approved_by: staffId
    })

    const { data, error } = await supabase
      .from('od_odrequest')
      .update({
        status: newStatus
      })
      .eq('id', requestId)
      .select()
      .single()

    if (error) {
      console.error(
        'OD APPROVAL SUPABASE ERROR:',
        error
      )

      return res.status(500).json({
        message: 'Failed to update OD request',
        error: error.message
      })
    }

    return res.json({
      message:
        `OD request moved to ${newStatus} successfully`,
      request: data
    })

  } catch (error: any) {
    console.error(
      'OD APPROVAL SERVER ERROR:',
      error
    )

    return res.status(500).json({
      message:
        error?.message ||
        'Failed to update OD request'
    })
  }
})

// ------------------------------------
// STAFF - GET ALL STAFF
// ------------------------------------

app.get('/staff/all/', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('od_staff')
      .select('id, name, staff_id, department, designation')
      .order('id', { ascending: true })

    if (error) {
      console.error('STAFF LIST SUPABASE ERROR:', error)
      return res.status(500).json({
        message: 'Failed to load staff list',
        error: error.message
      })
    }

    return res.json({
      staff: data || []
    })
  } catch (error: any) {
    console.error('STAFF LIST SERVER ERROR:', error)

    return res.status(500).json({
      message: error?.message || 'Failed to load staff list'
    })
  }
})

// ------------------------------------
// STUDENT - SAVE SETTINGS
// ------------------------------------

app.post('/student/settings/', async (req, res) => {
  try {
    const {
      student,
      event_coordinator,
      tutor,
      year_incharge,
      hod
    } = req.body

    if (
      student === undefined ||
      event_coordinator === undefined ||
      tutor === undefined ||
      year_incharge === undefined ||
      hod === undefined
    ) {
      return res.status(400).json({
        message: 'Student settings are incomplete'
      })
    }

    const { data, error } = await supabase
      .from('od_studentsettings')
      .upsert({
        student_id: Number(student),
        event_coordinator_id: Number(event_coordinator),
        tutor_id: Number(tutor),
        year_incharge_id: Number(year_incharge),
        hod_id: Number(hod)
      }, {
        onConflict: 'student_id'
      })
      .select()
      .single()

    if (error) {
      console.error('STUDENT SETTINGS SUPABASE ERROR:', error)

      return res.status(500).json({
        message: 'Failed to save student settings',
        error: error.message
      })
    }

    return res.json({
      success: true,
      message: 'Student settings saved successfully',
      settings: data
    })

  } catch (error: any) {
    console.error('STUDENT SETTINGS SERVER ERROR:', error)

    return res.status(500).json({
      message: error?.message || 'Failed to save student settings'
    })
  }
})

// ------------------------------------
// START SERVER
// ------------------------------------

const PORT = Number(process.env.PORT) || 5000

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`)
})