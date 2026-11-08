# System Monitor — Faculty Evaluation System

**Page:** `/monitor/` (e.g. `https://<your-site>/monitor/`). Administrators only.

## What our system monitors

| Event type | When it is recorded | Where it is stored | What it tells us |
|---|---|---|---|
| **Login Success** | A student, supervisor, or admin signs in correctly | `loginLogs` | Who used the system, when, and from what browser/device |
| **Login Failed** | A sign-in is rejected (wrong ID or password, or not an admin) | `loginLogs` | Possible forgotten passwords or someone guessing passwords |
| **Evaluation Submitted** | A student or supervisor submits a faculty evaluation | `activityLogs` | The system's main action happened: who evaluated and which subject/faculty |
| **Admin actions** (e.g. Delete Evaluation, Add Department, Export PDF) | An admin changes or exports records | `auditLog` | Changes to important data and who made them |

Each row shows the **date and time**, the **event type**, and the **user / source** (ID and role), plus details.

Extra features:
- **Live updates:** new events appear without refreshing.
- **Summary cards:** today's successful logins, failed logins, and evaluations.
- **Suspicious activity alert:** an ID with 3 or more failed logins within 10 minutes is flagged as possible password guessing.
- **Filter and search** by event type, user, or details.

## Security
- Logs are **append-only**: Firestore rules block editing or deleting entries.
- Only admins (users with an `admins/{uid}` record) can read the logs.
- A user can only create activity entries about themselves (`uid` must match the signed-in account).

## Setup (one time)
Deploy the updated rules so `activityLogs` works:

```bash
firebase deploy --only firestore:rules,hosting
```

The first time the monitor loads, Firestore may show a link in the browser console to create an index for `timestamp`. Click it if it appears.

## Demo script (2–3 minutes)
1. Open `/monitor/` and sign in as admin.
2. In another tab, open the student login and enter a **wrong password**. A red **Login Failed** row appears.
3. Sign in with the **correct password**. A green **Login Success** row appears.
4. Submit an evaluation. A purple **Evaluation Submitted** row appears with the subject.
5. Fail the login 3 times quickly. The **Suspicious activity** alert appears.
6. Use the filter to show only one event type, and explain what each event tells us.
