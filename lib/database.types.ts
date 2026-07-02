// Hand-authored from supabase/migrations/0001_init.sql, 0002_storage.sql,
// 0003_business_logic.sql (these migrations are the schema source of truth —
// see CLAUDE.md §6). Replace with the real generated file once the Supabase
// CLI is linked:
//   npx supabase login && npx supabase link --project-ref <ref>
//   npx supabase gen types typescript --linked > lib/database.types.ts

// employees.education jsonb shape (0005_phase1_5.sql)
export type EducationEntry = { degree: string; institution: string; year: string };

export type RoleT = "employee" | "dept_head" | "hr" | "admin" | "exec";
export type EmployeeStatusT = "active" | "inactive" | "pending";
export type LeaveCodeT = "sick" | "personal" | "vacation";
export type RequestStatusT =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "returned"
  | "cancelled";
export type AttendanceTypeT = "offsite" | "ot" | "wfh";
export type CheckinKindT = "in" | "out" | "wfh_morning" | "wfh_evening";
export type OtTypeT = "weekday_ot" | "holiday_normal" | "holiday_ot";
export type ApprovalActionT = "approve" | "reject" | "return" | "cancel" | "acknowledge";
export type AssetStatusT = "in_stock" | "assigned" | "returned" | "broken" | "disposed";
export type AssignStatusT = "pending_accept" | "accepted" | "returned";
export type BookingStatusT = "booked" | "cancelled";
export type CalTypeT = "holiday" | "meeting" | "merit" | "activity" | "leave" | "booking";
export type CalScopeT = "org" | "dept" | "personal";

type TableShape<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      departments: TableShape<{
        id: string;
        name: string;
        created_at: string;
      }>;
      employees: TableShape<
        {
          id: string;
          user_id: string | null;
          email: string;
          full_name: string;
          nickname: string | null;
          department_id: string | null;
          role: RoleT;
          position: string | null;
          phone: string | null;
          desk_phone: string | null;
          birthdate: string | null;
          hire_date: string | null;
          address: string | null;
          avatar_url: string | null;
          status: EmployeeStatusT;
          employee_code: string | null;
          education: EducationEntry[];
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id?: string | null;
          email: string;
          full_name: string;
          nickname?: string | null;
          department_id?: string | null;
          role?: RoleT;
          position?: string | null;
          phone?: string | null;
          desk_phone?: string | null;
          birthdate?: string | null;
          hire_date?: string | null;
          address?: string | null;
          avatar_url?: string | null;
          status?: EmployeeStatusT;
          employee_code?: string | null;
          education?: EducationEntry[];
        }
      >;
      attachments: TableShape<{
        id: string;
        bucket: string;
        path: string;
        filename: string | null;
        content_type: string | null;
        uploaded_by: string | null;
        entity: string | null;
        entity_id: string | null;
        created_at: string;
      }>;
      approvals: TableShape<{
        id: string;
        entity: string;
        entity_id: string;
        actor_id: string;
        action: ApprovalActionT;
        note: string | null;
        created_at: string;
      }>;
      audit_logs: TableShape<{
        id: number;
        actor_id: string | null;
        action: string;
        entity: string;
        entity_id: string | null;
        before: Record<string, unknown> | null;
        after: Record<string, unknown> | null;
        created_at: string;
      }>;
      notifications: TableShape<
        {
          id: string;
          user_id: string;
          type: string;
          title: string;
          body: string | null;
          link: string | null;
          read_at: string | null;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          type: string;
          title: string;
          body?: string | null;
          link?: string | null;
          read_at?: string | null;
        }
      >;
      push_subscriptions: TableShape<
        {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent: string | null;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent?: string | null;
        }
      >;
      leave_types: TableShape<{
        code: LeaveCodeT;
        name_th: string;
        default_annual_days: number | null;
        accrues_by_tenure: boolean;
        carry_over: boolean;
      }>;
      leave_balances: TableShape<{
        id: string;
        employee_id: string;
        year: number;
        leave_code: LeaveCodeT;
        entitled_hours: number;
        carried_hours: number;
        used_hours: number;
        updated_at: string;
      }>;
      leave_requests: TableShape<{
        id: string;
        employee_id: string;
        leave_code: LeaveCodeT;
        start_at: string;
        end_at: string;
        hours: number;
        reason: string | null;
        cert_url: string | null;
        status: RequestStatusT;
        approver_id: string | null;
        decided_at: string | null;
        exported_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
      work_locations: TableShape<{
        id: string;
        name: string;
        lat: number;
        lng: number;
        radius_m: number;
        required_photos: number;
        active: boolean;
        created_at: string;
      }>;
      field_requests: TableShape<{
        id: string;
        employee_id: string;
        type: AttendanceTypeT;
        location_id: string | null;
        work_date: string;
        planned_start: string | null;
        planned_end: string | null;
        reason: string | null;
        weekly_report: string | null;
        ot_hours: number | null;
        ot_type: OtTypeT | null;
        status: RequestStatusT;
        approver_id: string | null;
        decided_at: string | null;
        exported_at: string | null;
        pay_x1_hours: number;
        pay_x15_hours: number;
        pay_x3_hours: number;
        ot_breakdown: Record<string, unknown> | null;
        created_at: string;
        updated_at: string;
      }>;
      attendance_checkins: TableShape<{
        id: string;
        employee_id: string;
        field_request_id: string | null;
        location_id: string | null;
        kind: CheckinKindT;
        happened_at: string;
        gps_lat: number | null;
        gps_lng: number | null;
        distance_m: number | null;
        within_radius: boolean | null;
        selfie_url: string | null;
        photo_url: string | null;
        created_at: string;
      }>;
      vehicles: TableShape<{
        id: string;
        name: string;
        plate: string | null;
        driver_id: string | null;
        active: boolean;
      }>;
      van_bookings: TableShape<{
        id: string;
        vehicle_id: string;
        requester_id: string;
        driver_id: string | null;
        destination: string | null;
        purpose: string | null;
        start_at: string;
        end_at: string;
        status: BookingStatusT;
        created_at: string;
        updated_at: string;
      }>;
      van_passengers: TableShape<{
        booking_id: string;
        employee_id: string;
      }>;
      rooms: TableShape<{
        id: string;
        name: string;
        size: string | null;
        active: boolean;
      }>;
      room_bookings: TableShape<{
        id: string;
        room_id: string;
        requester_id: string;
        title: string | null;
        start_at: string;
        end_at: string;
        status: BookingStatusT;
        created_at: string;
        updated_at: string;
      }>;
      calendar_events: TableShape<{
        id: string;
        title: string;
        description: string | null;
        type: CalTypeT;
        scope: CalScopeT;
        department_id: string | null;
        owner_id: string | null;
        start_at: string;
        end_at: string | null;
        all_day: boolean;
        source_module: string | null;
        source_id: string | null;
        google_event_id: string | null;
        google_etag: string | null;
        last_synced_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
      assets: TableShape<{
        id: string;
        asset_tag: string | null;
        category: string;
        name: string;
        brand: string | null;
        model: string | null;
        serial: string | null;
        price: number | null;
        vendor: string | null;
        purchase_date: string | null;
        license_key: string | null;
        license_seats: number | null;
        license_expires_at: string | null;
        status: AssetStatusT;
        current_holder_id: string | null;
        note: string | null;
        created_at: string;
        updated_at: string;
      }>;
      asset_assignments: TableShape<{
        id: string;
        asset_id: string;
        employee_id: string;
        assigned_by: string | null;
        assigned_at: string;
        accepted_at: string | null;
        returned_at: string | null;
        status: AssignStatusT;
        created_at: string;
      }>;
      training_courses: TableShape<
        {
          id: string;
          name_th: string;
          name_en: string | null;
          open_date: string | null;
          close_date: string | null;
          location: string | null;
          training_dates: string | null;
          description: string | null;
          target_group: string | null;
          objectives: string | null;
          logo_url: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          name_th: string;
          name_en?: string | null;
          open_date?: string | null;
          close_date?: string | null;
          location?: string | null;
          training_dates?: string | null;
          description?: string | null;
          target_group?: string | null;
          objectives?: string | null;
          logo_url?: string | null;
          created_by?: string | null;
        }
      >;
      training_batches: TableShape<
        {
          id: string;
          course_id: string;
          batch_no: number | null;
          training_dates: string | null;
          location: string | null;
          note: string | null;
          created_at: string;
        },
        {
          id?: string;
          course_id: string;
          batch_no?: number | null;
          training_dates?: string | null;
          location?: string | null;
          note?: string | null;
        }
      >;
      training_participants: TableShape<
        {
          id: string;
          course_id: string;
          batch_id: string | null;
          first_name: string;
          last_name: string;
          position: string | null;
          organization: string | null;
          phone: string | null;
          email: string | null;
          note: string | null;
          created_at: string;
        },
        {
          id?: string;
          course_id: string;
          batch_id?: string | null;
          first_name: string;
          last_name: string;
          position?: string | null;
          organization?: string | null;
          phone?: string | null;
          email?: string | null;
          note?: string | null;
        }
      >;
      org_documents: TableShape<{
        id: string;
        title: string;
        description: string | null;
        category: string;
        storage_path: string;
        file_size_bytes: number | null;
        sort_order: number;
        uploaded_by: string | null;
        created_at: string;
      }>;
      announcements: TableShape<{
        id: string;
        title: string;
        body: string;
        cover_url: string | null;
        category: string;
        is_published: boolean;
        notify_push: boolean;
        created_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      announcement_comments: TableShape<{
        id: string;
        announcement_id: string;
        employee_id: string;
        body: string;
        created_at: string;
      }>;
    };
    Views: {
      employee_directory: {
        Row: {
          id: string;
          full_name: string;
          nickname: string | null;
          department_id: string | null;
          position: string | null;
          avatar_url: string | null;
          role: RoleT;
          status: EmployeeStatusT;
          phone: string | null;
          desk_phone: string | null;
          email: string;
          birthdate: string | null;
        };
        Relationships: [];
      };
      leave_balance_view: {
        Row: {
          id: string;
          employee_id: string;
          year: number;
          leave_code: LeaveCodeT;
          entitled_hours: number;
          carried_hours: number;
          used_hours: number;
          updated_at: string;
          available_hours: number;
          available_days: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      fn_compute_ot: {
        Args: { p_emp: string; p_date: string; p_start: string; p_end: string };
        Returns: {
          eligible: boolean;
          holiday: boolean;
          x1_hours: number;
          x1_5_hours: number;
          x3_hours: number;
          ot_hours: number;
          ot_type: OtTypeT | null;
          break_min: number;
        };
      };
      fn_weekly_ot_summary: {
        Args: { p_emp: string; p_date: string };
        Returns: { week_start: string; week_end: string; week_ot_hours: number; over_36: boolean };
      };
      fn_recompute_leave_balance: {
        Args: { p_emp: string; p_year: number };
        Returns: undefined;
      };
    };
    Enums: {
      role_t: RoleT;
      employee_status_t: EmployeeStatusT;
      leave_code_t: LeaveCodeT;
      request_status_t: RequestStatusT;
      attendance_type_t: AttendanceTypeT;
      checkin_kind_t: CheckinKindT;
      ot_type_t: OtTypeT;
      approval_action_t: ApprovalActionT;
      asset_status_t: AssetStatusT;
      assign_status_t: AssignStatusT;
      booking_status_t: BookingStatusT;
      cal_type_t: CalTypeT;
      cal_scope_t: CalScopeT;
    };
    CompositeTypes: Record<string, never>;
  };
}
