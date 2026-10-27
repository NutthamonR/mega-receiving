// ตั้งค่าการเชื่อมต่อ Supabase
// ถ้าเว้นว่างไว้ แอปจะเปิดใน "โหมดตัวอย่าง" (ข้อมูลจำลอง ไม่บันทึกจริง)
// ค่าทั้งสองดูได้ที่ Supabase > Project Settings > API
// anon key เป็นคีย์สาธารณะ ใส่ในหน้าเว็บได้ ความปลอดภัยมาจาก Row Level Security ใน schema.sql
export const CONFIG = {
  SUPABASE_URL: 'https://rfmiteekylzucpcntilw.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmbWl0ZWVreWx6dWNwY250aWx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwOTExMTMsImV4cCI6MjEwODY2NzExM30.K50FvWIk3iWQN3nWjsFas4c0qv3lg_NtGpXg2URSxdg',

  // แสดงปุ่ม "เข้าสู่ระบบด้วย Microsoft" (ต้องเปิด Azure provider ใน Supabase ก่อน)
  ENABLE_MICROSOFT_LOGIN: false, // เปิดเป็น true หลังตั้งค่า Azure ใน Supabase แล้ว

  // แสดงช่องเข้าสู่ระบบด้วยลิงก์ทางอีเมล
  ENABLE_EMAIL_LOGIN: true,

  // โดเมนอีเมลที่อนุญาต (ใช้แสดงผลในหน้า Login; การบล็อกจริงอยู่ใน schema.sql)
  ALLOWED_EMAIL_DOMAIN: 'megaclinicthailand.com',

  // ขนาดรูปสูงสุด (ด้านยาว, px) ก่อนอัปโหลด ช่วยลดพื้นที่จัดเก็บ
  MAX_IMAGE_SIZE: 1600,

  // จำนวนวันที่เก็บรูปสินค้า (ต้องตรงกับ RETENTION_DAYS ใน GitHub Actions) ใช้แสดงผลในหน้าเว็บ
  PHOTO_RETENTION_DAYS: 60,
};
