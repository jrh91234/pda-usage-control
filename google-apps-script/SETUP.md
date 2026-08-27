# เชื่อม Google Sheet และ Google Drive

1. สร้าง Google Sheet ใหม่ แล้วคัดลอก ID จาก URL (ข้อความระหว่าง `/d/` และ `/edit`).
2. เปิด **Extensions > Apps Script** ใน Sheet นั้น แล้ววางโค้ดจาก `Code.gs`.
3. แทนที่ `PASTE_YOUR_GOOGLE_SHEET_ID_HERE` ด้วย ID ของ Sheet แล้วกด Run ฟังก์ชัน `initialize` หนึ่งครั้ง เพื่อสร้างตาราง Devices, Transactions และโฟลเดอร์รูปใน Google Drive.
4. เลือก **Deploy > New deployment > Web app**. ตั้งสิทธิ์ตามนโยบายองค์กร แล้วคัดลอก URL ที่ลงท้ายด้วย `/exec`.
5. สร้างไฟล์ `.env.local` จาก `.env.example` และวาง URL นั้นแทนค่า. เริ่มเว็บใหม่หลังเปลี่ยนค่า.

เมื่อตั้งค่าแล้ว ทุกการเบิก/คืนจะเพิ่มแถวใน Transactions, อัปเดตสถานะ Devices และเก็บภาพยืนยันไว้ในโฟลเดอร์ Google Drive อัตโนมัติ.
