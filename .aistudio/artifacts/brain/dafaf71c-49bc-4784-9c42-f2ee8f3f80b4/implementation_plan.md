# Personal User Dashboard, Project Activity Tracker & Account Lifecycle Management

A slide-over personal dashboard drawer accessible from the top header avatar that empowers every user to track their created reviews and collaborative lobbies, submit role change requests directly to the Super Admin, update profile details, and securely manage their data lifecycle (granular history clearing and cascading account deletion).

## User Review & Critical Decisions

> [!IMPORTANT]
> The following user preferences were confirmed during the Phase 1 clarification interview and govern this architecture:

- **Confirmed Decision 1 (Navigation & Placement)**: The Personal Dashboard will open as a sleek slide-over drawer triggered whenever the user clicks their avatar/profile pill in the top header (`AppHeader`), remaining accessible from anywhere across the application without navigating away from current work.
- **Confirmed Decision 2 (Exclusive Role Change Requests)**: The option to request a role change will exist **strictly and exclusively inside this Personal Dashboard drawer and nowhere else**. The redundant request form previously located on the `/access` page and any lobby prompts are removed and redirected to the Personal Dashboard.
- **Confirmed Decision 3 (Granular History Deletion)**: A dedicated "Delete History" modal gives the user granular control to choose between clearing: (a) My Reviews only, (b) My Lobby Rooms only, or (c) All Personal Activity.
- **Confirmed Decision 4 (Account Deletion Cleanup Scope)**: When an account is deleted, the system executes a full cascading purge of the user's account record, their personally created lobbies, and their submitted reviews, concluding with an immediate secure sign-out.

---

## 1. Overview & Core Concept

### What It Does
The Personal Dashboard provides each authenticated team member (Creators, Reviewers, Admins, Super Admins) with a centralized personal cockpit. Users can:
1. **Track Project Activity**: View an aggregated activity summary displaying all brand compliance reviews they have submitted or reviewed (with live compliance scores, timestamps, and status), as well as private collaborative lobby rooms they created or joined.
2. **Profile Management**: Update their display name, department, and workspace brand with instantaneous validation and feedback.
3. **Exclusive Role Change Requests**: Select a target role (`ADMIN`, `REVIEWER`, `CREATOR`), provide an optional justification note, and submit the request directly to the Super Admin. The drawer displays real-time request status (`Pending`, `Approved`, or `Rejected`) and Super Admin resolution notes.
4. **Data Lifecycle & Privacy Controls**: Clear specific project histories (reviews, lobbies, or all) or permanently delete their user account with complete cascading cleanup.

### Target Audience & Persona
- **Content Creators**: Need to inspect their past compliance reviews, check room codes for collaborative edits, and request elevation to Reviewer/Admin when role duties expand.
- **Compliance Reviewers / Managers**: Need visibility into rooms they host, audits they approved, and quick access to account settings.
- **Workspace Administrators**: Require a clean personal cockpit distinct from the global administrative management console.

### Key Value
Eliminates fragmented account controls, unifies project tracking into a zero-latency slide-over drawer, and establishes clear security boundaries with Super Admin oversight.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Opening & Closing the Dashboard Drawer**:
   - The user clicks their avatar button in the top navigation bar (`AppHeader`).
   - A 460px-wide slide-over drawer smoothly translates into view from the right viewport edge with a softened backdrop scrim (`bg-ink-950/40 backdrop-blur-sm`).
   - The user can close the drawer via the `Esc` key, clicking the backdrop, or clicking the top-right close button (`X`).

2. **Editing Profile Details**:
   - The drawer header displays the user's avatar, initials, full name, email, current active role badge, and department.
   - An "Edit Profile" accordion allows updating Full Name, Department, and Workspace Brand Name.
   - Clicking "Save Changes" validates inputs, calls the server API, updates local session storage and Firestore, and fires a toast notification.

3. **Submitting a Role Change Request (Exclusive Location)**:
   - Within the dedicated "Role & Permissions" card, the user sees their current role and security tier.
   - If no request is pending, a role selector dropdown (`Reviewer (Compliance Manager)` or `Workspace Admin`) and a justification textarea are displayed.
   - Upon submission, the drawer immediately switches to a "Request Pending" status card showing timestamp and note, while the Super Admin's `/access` queue is updated.

4. **Tracking Projects & Activity**:
   - Segmented tab switch: `My Reviews (N)` vs `My Lobby Rooms (M)`.
   - **Reviews Tab**: Compact list of reviews submitted by this user, displaying title, brand, compliance score (e.g. `94%` in monospace tabular figures), status (`Approved`, `Needs Revision`, `Pending`), and direct link to review detail.
   - **Lobby Tab**: Shows private rooms created by this user (with room code, copyable link, participant count) and rooms joined as a collaborator.

5. **Granular History Deletion**:
   - Clicking "Delete History" opens a confirmation modal with radio selectors:
     - 🔘 *Reviews Only*: Deletes submitted reviews authored by this user.
     - 🔘 *Lobby Rooms Only*: Closes and deletes private lobbies hosted by this user.
     - 🔘 *All Personal Activity*: Clears both reviews and lobbies authored by the user.
   - Typing confirmation or clicking "Clear History" updates the database, re-fetches project lists, and notifies the user.

6. **Account Deletion (Danger Zone)**:
   - In the "Danger Zone" section at the bottom of the drawer, clicking "Delete Account" opens a destructive confirmation dialog.
   - Clear warning explains that all personal rooms, reviews, and credentials will be permanently erased.
   - Once confirmed, the API cascades deletion across `securityDB`, clears local storage, logs out from Firebase/session, and redirects smoothly to the home page with a confirmation toast.

### Visual Identity & Theme Discipline (SaaS Standard)
- **Palette & Contrast (60-30-10)**: 
  - Neutral canvas: Clean white (`#FFFFFF`) / dark slate (`#0F172A`) drawer surface.
  - Structural surfaces: Hairline dividers (`border-neutral-200 / border-neutral-800`), flat cards with 1px border lines and zero nested drop shadows.
  - Accent: High-intent indigo/brand purple (`#4F46E5`) for primary actions and destructive crimson (`#DC2626`) for Danger Zone operations.
- **Typography & Tabular Discipline**:
  - Headings: `Plus Jakarta Sans` / `Outfit` font stack, clean natural title casing without pseudo-code prefixes.
  - Data & Metrics: All timestamps, compliance score percentages, and room codes strictly use `tabular-nums` (`font-mono`) to prevent layout shifts.
  - Zero-Pill Rule: Metadata items (date, department, brand) use unboxed inline text with typographic separators (`·` or `/`).

---

## 3. Key Product Decisions & Trade-Offs

| Decision | Chosen Approach | Why | Alternatives Considered |
| :--- | :--- | :--- | :--- |
| **Drawer vs. Route** | Slide-over drawer over top header | Allows inspecting projects and requesting roles without losing work or active review draft in the main viewport. | Standalone `/profile` page (rejected: breaks collaborative lobby workflow and adds navigation friction). |
| **Role Request Exclusivity** | Centralized strictly in Personal Dashboard | User explicitly instructed "give option to request to change the role in here not anywhere else". Prevents confusion across pages. | Keeping duplicate cards on `/access` or `/lobby` (rejected: contradicts explicit user directive). |
| **Granular History Clearing** | 3-way radio selection (Reviews, Lobbies, All) | Confirmed by user in Phase 1; gives flexibility without accidental destruction of wanted rooms or reviews. | All-or-nothing wipe (rejected: too blunt for users who only want to reset test lobbies). |
| **Cascading Account Deletion** | Purge user record, hosted rooms, and submitted reviews | Prevents orphaned reviews and dangling lobby codes in the database, ensuring clean state. | Soft-deleting account and leaving orphaned rooms (rejected: confirmed by user in Phase 1). |

---

## 4. Technical Architecture & Data Strategy

### System & Component Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│ AppHeader (Top Navigation)                                             │
│ └── Avatar Button ──► onClick() ──► togglePersonalDashboard(true)      │
└────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│ <PersonalDashboardDrawer /> (Slide-Over Sheet)                         │
│ ├── 1. Profile Summary Card (Avatar, Name, Email, Role, Department)   │
│ │    └── Inline Edit Dialog / Form (Name, Dept, Brand)                │
│ ├── 2. Role & Access Request Card (Exclusive UI)                       │
│ │    ├── Current Role Indicator                                       │
│ │    ├── Request Form: Target Role Selector + Justification Note       │
│ │    └── Pending Status Tracker (Live status & Super Admin notes)      │
│ ├── 3. Project & Activity Tracker (Segmented Tabs)                    │
│ │    ├── Tab: My Compliance Reviews (Score, Status, Date, Link)       │
│ │    └── Tab: My Collaborative Lobbies (Room Code, Title, Role)       │
│ └── 4. Account Lifecycle & Data Management (Danger Zone)               │
│      ├── Action: Delete History (Modal: Reviews / Lobbies / All)      │
│      └── Action: Delete Account (Modal: Cascading Purge & Sign Out)   │
└────────────────────────────────────────────────────────────────────────┘
                 │                                  │
                 ▼                                  ▼
┌───────────────────────────────────┐  ┌───────────────────────────────────┐
│ /api/user/profile                 │  │ /api/pins (Role Requests)         │
│ - PATCH: update profile fields    │  │ - POST: action="request_role_..." │
│ - DELETE: delete_history / account│  │ - GET: fetch user role status     │
└───────────────────────────────────┘  └───────────────────────────────────┘
                 │                                  │
                 ▼                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Server Backend & Storage Layer                                         │
│ ├── securityDB (Users, Credentials, Role Requests, Audit Logs)         │
│ ├── reviewsDB (Compliance Audits & Feedback)                          │
│ └── lobbiesDB (Collaborative Rooms & Joining Access)                   │
└────────────────────────────────────────────────────────────────────────┘
```

### Data Contract & API Endpoints

1. **Profile Updates (`PATCH /api/user/profile`)**:
   - Payload: `{ userId, email, name, department, brand_name }`
   - Action: Updates user in `securityDB`, synchronizes with active session and Firestore user record.

2. **Role Change Requests (`POST /api/pins` with `action: "request_role_change"`)**:
   - Payload: `{ userId, email, requested_role, note }`
   - Action: Sets `role_request_status = "pending"`, `requested_role`, `role_request_note`, and `role_request_at`.

3. **Delete History (`POST /api/user/profile` with `action: "delete_history"`)**:
   - Payload: `{ userId, email, scope: "reviews" | "lobbies" | "all" }`
   - Action:
     - `reviews`: Purges reviews where `author_email === email` or `user_id === userId`.
     - `lobbies`: Purges lobbies where `creator_email === email` or `creator_id === userId`.
     - `all`: Executes both purges.

4. **Delete Account (`POST /api/user/profile` with `action: "delete_account"`)**:
   - Payload: `{ userId, email }`
   - Action:
     - Cascades: Deletes all reviews created by this user.
     - Cascades: Deletes all lobbies created by this user.
     - Deletes user record from `securityDB`.
     - Logs audit event `USER_ACCOUNT_DELETED`.

### Interactive Component & State Mapping

- **Header Trigger**: `useAuth()` hook provides `personalDashboardOpen` and `setPersonalDashboardOpen(boolean)`.
- **Top Navigation Integration**: Clicking the avatar in `AppHeader` toggles `setPersonalDashboardOpen(true)`. The existing "Switch account" remains easily accessible via a discrete button in the drawer footer.
- **De-duplication in `/access` and `/lobby`**:
  - Remove lines 490–579 in `/src/app/access/page.tsx` (the previous role change request card).
  - In its place on `/access`, render a clean informational banner with a direct button: `"Request Role Change in Personal Dashboard"`, which triggers `setPersonalDashboardOpen(true)`.
  - Ensure `/lobby` contains no alternative role request forms.
- **Live Sync & Optimistic UI**: Profile updates and history clearing immediately update local state and re-render the project activity list without a full page reload.

---

## 5. Verification & Testing Checklist

- [ ] **Header Trigger**: Clicking the user avatar in the sticky top header opens the Personal Dashboard drawer smoothly.
- [ ] **Profile Editing**: Modifying Name, Department, and Workspace updates the header and persists across reloads.
- [ ] **Role Request Exclusivity**:
  - Verified role request form is available inside the Personal Dashboard.
  - Verified old role request card is removed from `/access` and replaced with a drawer trigger.
  - Verified role request submission creates a pending request visible to the Super Admin in `/access`.
- [ ] **Project Activity Tracking**:
  - Reviews authored by the user appear with title, score, date, and link.
  - Collaborative lobbies created or joined by the user appear with room codes.
- [ ] **Granular History Clearing**:
  - Deleting "Reviews Only" removes reviews while keeping lobbies intact.
  - Deleting "Lobby Rooms Only" removes lobbies while keeping reviews intact.
  - Deleting "All Activity" clears both lists.
- [ ] **Account Deletion Cascade**:
  - Confirming account deletion purges user, lobbies, and reviews from the database.
  - User is immediately signed out and returned to clean unauthenticated state.
- [ ] **Compilation & Linting**: `compile_applet` succeeds with 0 errors.
