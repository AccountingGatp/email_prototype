import Database from "better-sqlite3";

const db = new Database("./data/email_tracker.db");
db.prepare(
  "DELETE FROM settings WHERE key IN ('gmail_history_id', 'gmail_initial_sync_done')"
).run();
db.prepare("UPDATE settings SET value = ? WHERE key = 'shared_inbox_email'").run(
  "diwakar@gatpsolutions.com"
);
console.log("reset sync cursors + shared inbox email");
console.log(db.prepare("SELECT * FROM settings").all());
