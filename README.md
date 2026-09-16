# Chris Todo

A simple task workbook. It answers one question: *what did I agree to, who is it for, and when is it due?*

No login, no accounts, no monthly fee. It works on an iPhone, a Samsung, and a laptop, and it keeps working with no internet.

---

## The four sheets

Across the top there are four tabs, like sheets in a spreadsheet.

**Active** — everything on Chris's own plate.
**Assigned out** — things he handed to someone else. Each one is stamped *Assigned to Sarah on 20 Sep*, and after a while the app asks if he wants to check in.
**Done** — ticked off.
**Cancelled** — no longer happening, but not deleted.

---

## Adding a task

Tap **+ Add task**. The only thing that is required is the task name. Everything else is optional:

- **Team** — a dropdown pre-filled with Canva teams
- **Type** — Project, Review, Meeting, Decision, Admin, Follow-up, Speaking, Other
- **Person in charge** — suggests people already used
- **My contact** — suggests email addresses already used for that team
- **Deadline**
- **Notes**

### Talking instead of typing

If the **Speak** button appears next to the task name, tap it and say the task out loud. It fills in the name for you. It shows up on Android and Chrome, and on iPhone you can also just use the keyboard's microphone key. If the browser cannot do it, the button simply is not there.

---

## Breaking a big job into steps

Open a task and tap **Add sub-task**. The step appears indented underneath its parent, with its own person and its own deadline. The parent then shows *1 of 3 steps done*, so a big job stays as one line instead of cluttering the list.

---

## Handing something to someone else

Open the task, tap **Assign to someone**, type their name. It moves to the **Assigned out** sheet with today's date on it.

After a week (you can change this in Settings), that row grows a prompt: *Check in with Sarah on this?* with three buttons — **Yes, chased**, **Not yet**, and **It is done**.

---

## Deadlines and alarms

Deadlines colour themselves as they approach. Red means overdue. Amber means due within three days.

**On Samsung, Android and computers:** open Settings and tap **Turn on reminders**. You get a notification about anything due soon.

**On iPhone:** Apple does not allow web apps to alarm in the background, so use the **Add to calendar** button on a task instead. It drops the deadline into the iPhone calendar with a real alarm set for the day before. This is the reliable way to get an iPhone to nag him.

---

## Sorting and finding

Use the toolbar to sort by deadline, team, person, type, newest, or task name, and to filter to one team or one person. The search box looks through names, notes, people and emails.

---

## Ticking things off

Tap the ✓ on the right of any row to mark it done. Tap the ↩ on a done task to bring it back. To cancel something instead, open it and tap **Cancel task**.

---

## Putting it on a phone

**iPhone:** open the link in Safari, tap the Share button, then **Add to Home Screen**.

**Samsung / Android:** open the link in Chrome, tap the ⋮ menu, then **Install app** or **Add to Home screen**.

It then behaves like a normal app with its own icon, and opens with no internet.

---

## Teams and people

The team dropdown comes loaded with Canva's product areas and departments. In **Settings** you can add or remove teams.

When Chris types a person the app has not seen before, after saving it asks: *Add them to this team, or keep them just for this task?* If he adds them to the team, they will be suggested next time he picks that team.

---

## Backing up

The app stores everything on the device it is used on. It does not sync by itself.

In **Settings**, **Export a backup** saves a file. **Import a backup** loads that file onto another device — that is also how you move everything from a laptop to a phone.

Worth doing every few weeks.

---

## Running it on this computer

Open a Terminal in this folder and run:

```
python3 -m http.server 8777
```

Then visit `http://localhost:8777` in a browser.

## Files

| File | What it is |
|---|---|
| `index.html` | The page |
| `styles.css` | The look |
| `app.js` | All the logic |
| `teams.json` | The starter team list |
| `manifest.json` | Makes it installable as an app |
| `service-worker.js` | Makes it work offline |
