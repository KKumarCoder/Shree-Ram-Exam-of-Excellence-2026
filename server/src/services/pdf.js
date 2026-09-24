import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const logo = path.resolve(
  here,
  "../../../client/public/images/school-logo.png",
);
export { admitPdf } from './admitPdf.js';

// Reference-matched landscape receipt; all candidate/payment data stays dynamic.
export async function applicationReceiptPdf(res, student, payment) {
  const statusUrl = new URL('/status', process.env.PUBLIC_BASE_URL || process.env.FRONTEND_URL || 'https://olympiad.srpskanhra.com');
  const qr = await QRCode.toBuffer(statusUrl.href, { margin: 1, width: 420 });
  const doc = new PDFDocument({ size: 'A5', layout: 'landscape', margin: 0, info: { Title: 'Shree Ram Exam of Excellence 2026' } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="Shree Ram Exam of Excellence 2026.pdf"');
  res.setHeader('Cache-Control', 'private, no-store');
  doc.pipe(res);
  // Keep the reference artwork proportional on a physical 210 x 148 mm page.
  // PDFKit's MediaBox retains A5 dimensions; text layout uses artwork coordinates.
  const pageWidth = doc.page.width, pageHeight = doc.page.height;
  const scale = pageWidth / 1536;
  doc.translate(0, (pageHeight - 1024 * scale) / 2).scale(scale);
  doc.page.width = 1536;
  doc.page.height = 1024;
  const navy = '#061d3b', teal = '#00485d', gold = '#ffcf70';
  const text = (value, x, y, width, size = 20, bold = false, color = navy, extra = {}) => {
    doc.font(extra.font || (bold ? 'Helvetica-Bold' : 'Helvetica')).fontSize(size).fillColor(color)
      .text(String(value ?? '-'), x, y, { width, lineGap: 3, ...extra });
  };
  const line = (x1, y1, x2, y2, color = '#afd0e1', weight = 1) => doc.moveTo(x1, y1).lineTo(x2, y2).lineWidth(weight).strokeColor(color).stroke();
  const box = (x, y, w, h, color, radius = 13) => doc.roundedRect(x, y, w, h, radius).fill(color);
  const icon = (kind, x, y, size = 26, color = teal) => {
    doc.save().translate(x, y).scale(size / 24).lineWidth(2).strokeColor(color).fillColor(color).lineCap('round').lineJoin('round');
    if (kind === 'person') { doc.circle(12, 6, 4).fill(); doc.path('M 3 23 L 3 19 C 3 11 21 11 21 19 L 21 23 Z').fill(); }
    else if (kind === 'clock') { doc.circle(12, 12, 10).stroke(); doc.path('M12 5 L12 12 L17 15').stroke(); }
    else if (kind === 'download') { doc.path('M12 2 L12 16 M7 11 L12 16 L17 11 M3 17 L3 22 L21 22 L21 17').stroke(); }
    else if (kind === 'calendar') { doc.roundedRect(3, 4, 18, 18, 2).stroke(); doc.path('M7 1 L7 7 M17 1 L17 7 M3 10 L21 10').stroke(); for (const xx of [7,13,18]) for (const yy of [14,19]) doc.rect(xx-1, yy-1, 2, 2).fill(); }
    else if (kind === 'school') { doc.path('M1 9 L12 2 L23 9 M4 8 L4 23 L20 23 L20 8 M10 23 L10 16 L14 16 L14 23').stroke(); doc.circle(12, 9, 2).stroke(); }
    else if (kind === 'cap') { doc.path('M1 8 L12 3 L23 8 L12 13 Z M5 11 L5 17 Q12 22 19 17 L19 11 M23 8 L23 18').stroke(); }
    else if (kind === 'phone') { doc.path('M4 2 L9 7 L6 10 Q10 17 15 18 L18 14 L23 19 Q21 25 16 23 Q2 18 1 6 Z').fill(); }
    else if (kind === 'pin') { doc.path('M12 24 C9 19 2 13 2 8 C2 -3 22 -3 22 8 C22 13 15 20 12 24 Z').fill(); doc.circle(12, 8, 3).fill('#ffffff'); }
    else if (kind === 'coins') { for (let i=2;i>=0;i--) { doc.ellipse(12, 6+i*6, 10, 4).fillAndStroke(color,'#ffffff'); } }
    else if (kind === 'lock') { doc.path('M3 4 L12 0 L21 4 L20 15 Q18 21 12 24 Q6 21 4 15 Z').fill(); doc.roundedRect(8,10,8,8,1).fill('#ffffff'); doc.path('M9 10 L9 8 C9 4 15 4 15 8 L15 10').strokeColor('#ffffff').stroke(); }
    else { doc.path('M3 1 L15 1 L22 8 L22 23 L3 23 Z M15 1 L15 8 L22 8 M7 12 L17 12 M7 16 L17 16 M7 20 L13 20').stroke(); }
    doc.restore();
  };
  doc.rect(0,0,1536,1024).fill('#fafcfd');
  box(46,76,1446,898,'#e7ebee',16);
  box(46,72,1446,898,'#ffffff',16);
  doc.roundedRect(46,72,1446,898,16).lineWidth(1).strokeColor('#dde3e7').stroke();
  doc.image(logo, 83, 100, { fit:[166,180], align:'center', valign:'center' });
  text('SHREE RAM PUBLIC SCHOOL',303,100,770,48,true);
  box(303,159,758,50,gold,12);
  text('Shree Ram Exam of Excellence 2026',316,167,732,37,true,navy,{align:'center'});
  icon('pin',304,223,27); text('Kanhra-Badhra, Charkhi Dadri, Haryana 127310',342,230,393,18);
  line(737,221,737,254); icon('phone',764,224,25); text('01252299999 , 8199991081-84',800,230,279,18);
  line(1095,109,1095,250);
  const nccLogo = path.resolve(here,'../../../client/public/images/ncc-logo.png');
  if (fs.existsSync(nccLogo)) doc.image(nccLogo,1117,91,{fit:[145,182],align:'center',valign:'center'});
  line(1301,127,1386,127,'#eab348',2);
  text('DISCIPLINE\nCHARACTER\nEXCELLENCE',1301,145,170,17,false,navy,{characterSpacing:2.5,lineGap:7});
  line(1301,219,1358,219,'#eab348',2);
  doc.path('M46 240 Q93 284 164 297 L46 297 Z').fill(gold);
  doc.path('M1492 198 Q1415 266 1230 293 L1492 293 Z').fill('#fff0df');
  const band = doc.linearGradient(46,291,1492,420).stop(0,'#003b50').stop(1,'#005166');
  box(46,291,1446,143,band,12);
  doc.path('M973 420 Q1191 280 1492 251 L1492 258 Q1205 301 993 420 Z').fill(gold);
  icon('file',109,315,80,'#ffffff');
  text('APPLICATION',238,307,456,60,true,'#ffffff');
  text('RECEIPT',688,307,380,60,true,gold);
  text('Save this acknowledgement for future status checks.',239,381,850,20,false,'#ffffff');
  text('Nurturing\nBright Minds',1236,327,220,29,false,'#ffffff',{font:'Times-Italic',align:'center'});
  doc.moveTo(1332,402).quadraticCurveTo(1370,380,1410,382).lineWidth(4).strokeColor(gold).stroke();
  box(47,420,1444,548,'#ffffff',13);
  box(71,429,1397,87,'#eff8fc');
  box(86,442,66,62,'#e3f3fb',16); icon('file',103,452,39);
  text('APPLICATION REFERENCE',187,450,430,15,true,teal,{characterSpacing:1});
  text(student.applicationRef,187,473,460,32,true);
  line(670,447,670,499);
  box(726,442,67,62,'#dcf1f8',16); icon('calendar',743,453,37);
  text('ISSUED ON',819,451,450,15,true,teal,{characterSpacing:1});
  text(new Date().toLocaleDateString('en-GB',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric'}),819,475,500,27,true);
  box(71,527,709,39,'#e7f2f8',10); icon('person',88,536,24);
  text('CANDIDATE DETAILS',124,537,650,24,true,teal);
  const fields=[['person','STUDENT NAME',student.studentName],['cap','CLASS / DATE OF BIRTH',`${student.studentClass} / ${student.dob}`],['person','GUARDIAN NAME',student.guardianName],['phone','GUARDIAN MOBILE',`******${student.guardianPhone.slice(-4)}`],['school','CURRENT SCHOOL',student.currentSchool]];
  fields.forEach(([symbol,label,value],i)=>{
    const yy=582+i*41;
    icon(symbol,86,yy-3,26);
    text(label,137,yy,307,15,false,teal);
    let size=20; doc.font('Helvetica').fontSize(size);
    while(doc.heightOfString(String(value),{width:317,lineGap:1})>33 && size>9) doc.fontSize(--size);
    text(value,457,yy-2,317,size,false,navy,{lineGap:1});
    if(i<4){doc.save().dash(1,3);line(137,yy+28,774,yy+28,'#b9d4e2');doc.restore();}
  });
  doc.roundedRect(806,528,211,247,9).lineWidth(1.5).strokeColor('#acd3e8').stroke();
  if(student.photoPath && fs.existsSync(student.photoPath)) {
    try { doc.save().rect(820,536,183,235).clip();doc.image(student.photoPath,820,536,{cover:[183,235],align:'center',valign:'center'});doc.restore(); }
    catch { doc.restore(); }
  }
  box(1035,527,433,243,'#fff6e3');
  icon('coins',1078,547,32);text('APPLICATION / PAYMENT STATUS',1132,558,320,16,true);
  box(1052,592,397,93,student.status==='CONFIRMED'?'#dcefdc':'#ffdf85',14);
  icon('clock',1085,620,43,navy);
  const statusLabels={PAYMENT_UNDER_VERIFICATION:'PAYMENT UNDER\nVERIFICATION',PAYMENT_PENDING:'PAYMENT\nPENDING',PAYMENT_REJECTED:'PAYMENT\nREJECTED',CONFIRMED:'PAYMENT\nCONFIRMED',CONFIRMING:'PAYMENT\nPROCESSING',CANCELLED:'CANCELLED'};
  text(statusLabels[student.status] || student.status.replaceAll('_',' '),1144,608,288,27,true,navy,{align:'center'});
  text(`Fee: INR ${payment?Number(payment.amount).toFixed(2):'-'}  |  Mode: ${payment?.mode==='manual'?'Bank / UPI':payment?.mode==='razorpay'?'Online':'-'}`,1053,706,397,20,false,navy,{align:'center'});
  box(71,788,1397,165,'#f3f7f9');
  doc.roundedRect(74,789,161,160,13).fillAndStroke('#ffffff',gold);
  doc.image(qr,88,802,{width:135,height:135});doc.link(74,789,161,160,statusUrl.href);
  line(264,808,264,938);line(965,811,965,938);
  doc.circle(323,820,22).fill(teal);icon('download',312,808,22,'#ffffff');
  text('DOWNLOAD YOUR ADMIT CARD LATER',362,812,580,18,true);
  ['Open the status page or scan this QR code.','Enter your application reference and guardian mobile.','Verify the mobile OTP. After payment approval, download your admit card.'].forEach((value,i)=>{
    const yy=855+i*29;doc.circle(316,yy+10,15).fill(teal);text(i+1,307,yy-1,18,20,true,'#ffffff',{align:'center'});text(value,353,yy,598,18);
  });
  box(1007,794,460,96,'#eaf0f4',15);icon('lock',1034,813,47);
  text('This is an application acknowledgement,\nnot an admit card or proof of cleared payment.\nKeep it safely; never share your OTP.',1105,813,351,16,false,navy,{lineGap:7});
  doc.font('Times-Italic').fontSize(29).fillColor(navy).text('Learn Today  |  Excel Tomorrow',1050,907,{width:397,align:'center'});
  doc.moveTo(1114,951).quadraticCurveTo(1248,932,1388,939).lineWidth(2).strokeColor('#f4b62b').stroke();
  doc.end();
}
