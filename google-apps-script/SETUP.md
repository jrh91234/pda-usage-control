# เชื่อม Google Sheet และ Google Drive

ตั้งค่าและ deploy ไว้แล้ว โดยใช้ Google Sheet และ Apps Script ต่อไปนี้:

- Sheet: https://docs.google.com/spreadsheets/d/1u2Ywi5fqT1ApY9CMCCSiAYNkSCTBFs-QnEeXOKfp2LA/edit
- Web app: https://script.google.com/macros/s/AKfycbwGAfrkDX5mfwiFpp-j_vngJLeKRf2YCHSN3R07qu2tRju4Q5-0K2drZdWGhY9IV2x-/exec
- Script ID: `1ubuLyujo3TZ2MEy8aSsQui3oUmev1kFwxDj0QgPAyypZtvXUz-tfw2ZT`

การ deploy ตั้งค่าเป็น **Anyone / ทุกคน** และรันฟังก์ชัน `initialize` แล้ว เพื่อสร้างตาราง Devices, Transactions, Users, อุปกรณ์เริ่มต้น 11 เครื่อง, บัญชี admin และโฟลเดอร์รูปใน Google Drive.

หากต้องการ deploy เวอร์ชันใหม่ด้วย Clasp ให้รัน `clasp push` และ `clasp deploy` จากโฟลเดอร์ `google-apps-script`.

เมื่อตั้งค่าแล้ว ทุกการเบิก/คืนจะเพิ่มแถวใน Transactions, อัปเดตสถานะ Devices, ลงทะเบียนผู้ใช้และอุปกรณ์จากหน้า Admin และเก็บภาพยืนยันไว้ในโฟลเดอร์ Google Drive อัตโนมัติ.

บัญชีเริ่มต้นสำหรับเข้าใช้งานครั้งแรกคือ `admin` / `PDAadmin2026!` จากนั้นแนะนำให้ Admin ลงทะเบียนบัญชีของพนักงานและเปลี่ยนรหัสผ่านตามนโยบายองค์กร.
