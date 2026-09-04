import axios from "axios";

// Local backend used by the Vite frontend during development.
// server.ts is running on http://localhost:5000 and its routes
// already start with /student/... and /staff/....
export const API_BASE_URL = "https://nsm-eod-web.onrender.com";

const API = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// ---------------- STUDENT LOGIN ----------------

export async function studentLogin(
  username: string,
  password: string
) {
  const response = await API.post("/student/login/", {
    register_no: username.trim(),
    password,
  });

  return response.data;
}

// ---------------- STAFF LOGIN ----------------

export async function staffLogin(
  staffId: string,
  password: string
) {
  const response = await API.post("/staff/login/", {
    staff_id: staffId.trim(),
    password,
  });

  return response.data;
}

// ---------------- APPLY OD ----------------

export async function applyOD(data: {
  student: number;
  event_name: string;
  event_type: string;
  location: string;
  from_date: string;
  to_date: string;
  from_time: string;
  to_time: string;
  no_of_days: number;
  reason: string;
  poster_link: string;
}) {
  try {
    const response = await API.post("/student/apply-od/", data);
    return response.data;
  } catch (error: any) {
    const message =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      "Unable to submit OD request.";

    throw new Error(message);
  }
}

// ---------------- OD HISTORY ----------------

export async function getODHistory(studentId: number) {
  try {
    const response = await API.get(
      `/student/history/${studentId}/`
    );

    return response.data;
  } catch (error: any) {
    const message =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      "Unable to load OD history.";

    throw new Error(message);
  }
}

// ---------------- STAFF PENDING REQUESTS ----------------

export async function getPendingRequests(staffId: number) {
  try {
    const response = await API.get(
      `/staff/pending-requests/${staffId}/`
    );

    return response.data;
  } catch (error: any) {
    const message =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      "Unable to load pending OD requests.";

    throw new Error(message);
  }
}

// ---------------- APPROVE / REJECT OD ----------------

export async function approveOD(data: {
  request_id: number;
  staff_id: number;
  action: string;
}) {
  try {
    const response = await API.post(
      "/staff/approve/",
      data
    );

    return response.data;
  } catch (error: any) {
    const message =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      "Unable to update OD request.";

    throw new Error(message);
  }
}

// ---------------- STUDENT NOTIFICATIONS ----------------

export async function getNotifications(studentId: number) {
  const response = await API.get(
    `/student/notifications/${studentId}/`
  );

  return response.data;
}

// ---------------- GET ALL STAFF ----------------

export async function getAllStaff() {
  const response = await API.get("/staff/all/");

  return response.data;
}

// ---------------- SAVE STUDENT SETTINGS ----------------

export async function saveStudentSettings(data: {
  student: number;
  event_coordinator: number;
  tutor: number;
  year_incharge: number;
  hod: number;
}) {
  const response = await API.post(
    "/student/settings/",
    data
  );

  return response.data;
}

// ---------------- CLASS OD ----------------

export async function classOD(
  department: string,
  year: string,
  section: string,
  date: string
) {
  const response = await API.get(
    "/staff/class-od/",
    {
      params: {
        department,
        year,
        section,
        date,
      },
    }
  );

  return response.data;
}

// ---------------- CHANGE PASSWORD ----------------

export async function changePassword(data: {
  user_type: string;
  user_id: number;
  current_password: string;
  new_password: string;
}) {
  const response = await API.post(
    "/change-password/",
    data
  );

  return response.data;
}


// ============================================================
// NEW APPROVAL TRACKING FUNCTIONS
// ============================================================

// ---------------- APPROVAL TRACKING TYPE ----------------

export interface ApprovalTracking {
  event_coordinator: {
    staff_id: number;
    name: string;
    status: string;
  };

  tutor: {
    staff_id: number;
    name: string;
    status: string;
  };

  year_incharge: {
    staff_id: number;
    name: string;
    status: string;
  };

  hod: {
    staff_id: number;
    name: string;
    status: string;
  };

  current_role: string;
  overall_status: string;
}

// ---------------- GET OD APPROVAL TRACKING ----------------

export async function getApprovalTracking(
  requestId: number
) {
  try {
    const response = await API.get(
      `/student/approval-tracking/${requestId}/`
    );

    return response.data;
  } catch (error: any) {
    const message =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      "Unable to load OD approval tracking.";

    throw new Error(message);
  }
}

// ---------------- GET STAFF APPROVAL TRACKING ----------------

export async function getStaffApprovalTracking(
  requestId: number
) {
  try {
    const response = await API.get(
      `/staff/approval-tracking/${requestId}/`
    );

    return response.data;
  } catch (error: any) {
    const message =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      "Unable to load approval tracking.";

    throw new Error(message);
  }
}

// ---------------- GET STUDENT SETTINGS ----------------

export async function getStudentSettings(
  studentId: number
) {
  try {
    const response = await API.get(
      `/student/settings/${studentId}/`
    );

    return response.data;
  } catch (error: any) {
    const message =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      "Unable to load student settings.";

    throw new Error(message);
  }
}

// ---------------- GET NEXT APPROVER ----------------

export async function getNextApprover(
  requestId: number
) {
  try {
    const response = await API.get(
      `/student/next-approver/${requestId}/`
    );

    return response.data;
  } catch (error: any) {
    const message =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      "Unable to determine the next approver.";

    throw new Error(message);
  }
}