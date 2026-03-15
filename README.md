# Instagram Followers & Following Tracker v3

A powerful browser console utility to track Instagram follower growth, identify "unfollowers," and detect accounts that have blocked you or deactivated.

---

## 🚀 Features

- **Snapshot Tracking** – Save snapshots of your followers/following lists to `localStorage` so you can compare them over time.
- **Deep Diffing** – Compare any two snapshots to see exactly who followed or unfollowed you between those points in time.
- **Friendship Checker** – Detects if a user has blocked you, deactivated their account, or if the relationship is mutual.
- **Smart Fetching** – Uses a hybrid approach (REST + GraphQL) to ensure 100% accuracy in list retrieval.
- **Data Portability** – Export data as **CSV** (for Excel/Google Sheets) or **JSON** (for backups).

---

## 🛠 How to Use

1. Open [Instagram.com](https://www.instagram.com) and log in to your account.
2. Press **F12** or **Ctrl+Shift+I** to open the Developer Tools.
3. Click on the **Console** tab.
4. Paste the entire script into the console and press **Enter**.
5. Enter the target username in the UI overlay and click **Fetch Now**.

---

## 📊 Relationship Definitions

| Label | Meaning |
|---|---|
| **Mutual** | You follow each other. |
| **Fans Only** | They follow you, but you don't follow back. |
| **Not Following Back** | You follow them, but they don't follow back. |
| **NOT FOUND** | Likely blocked you or deleted their account. |

---

## ⚠️ Disclaimer

Use at your own risk. This tool is for **educational and personal use only**.

Automated scraping violates [Instagram's Terms of Service](https://help.instagram.com/581066165581870). Excessive use may result in account restrictions or bans. Always use a reasonable delay between requests.