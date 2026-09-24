import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const logo = fileURLToPath(new URL('../../../client/public/images/school-logo.png', import.meta.url));

export async function admitPdf(res, student, settings) {
  const qr = await QRCode.toBuffer(`${process.env.PUBLIC_BASE_URL || 'https://olympiad.srpskanhra.com'}/api/verify/${student.admitToken}`, { width: 400, margin: 1, errorCorrectionLevel: 'M' });
  const doc = new PDFDocument({ size: 'A5', layout: 'landscape', margin: 0, info: { Title: `SHREE 2026 Admit Card ${student.registrationNumber}` } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${student.registrationNumber}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  doc.pipe(res);
  const scale = Math.min(doc.page.width / 1426, doc.page.height / 1103);
  doc.translate((doc.page.width - 1426 * scale) / 2, (doc.page.height - 1103 * scale) / 2).scale(scale);
  // Physical MediaBox stays A5; use reference coordinates for text wrapping.
  doc.page.width = 1426; doc.page.height = 1103;
  const navy = '#052742', teal = '#064960', gold = '#f4d36b', pale = '#eef8fe';
  const text = (value,x,y,width,size=20,bold=false,color=navy,extra={}) => {
    doc.font(extra.font || (bold?'Helvetica-Bold':'Helvetica')).fontSize(size).fillColor(color).text(String(value ?? ''),x,y,{width,lineGap:2,...extra});
  };
  const fit = (value,x,y,width,height,size=20,bold=false) => {
    doc.font(bold?'Helvetica-Bold':'Helvetica').fontSize(size);
    while(doc.heightOfString(String(value),{width,lineGap:2})>height && size>8) doc.fontSize(--size);
    text(value,x,y,width,size,bold);
  };
  const line=(x,y,x2,y2,color='#9bc5de',weight=1)=>doc.moveTo(x,y).lineTo(x2,y2).lineWidth(weight).strokeColor(color).stroke();
  const box=(x,y,w,h,color,r=5)=>doc.roundedRect(x,y,w,h,r).fill(color);
  const icon=(kind,x,y,size=28,color=teal)=>{
    doc.save().translate(x,y).scale(size/24).lineWidth(2).strokeColor(color).fillColor(color).lineJoin('round').lineCap('round');
    if(kind==='person'){doc.circle(12,5,4).fill();doc.path('M3 23 L3 18 C3 10 21 10 21 18 L21 23 Z').fill();}
    else if(kind==='calendar'){doc.roundedRect(3,4,18,18,2).stroke();doc.path('M7 1 L7 7 M17 1 L17 7 M3 10 L21 10').stroke();for(const xx of [7,12,17])for(const yy of [14,19])doc.rect(xx,yy,2,2).fill();}
    else if(kind==='phone')doc.path('M4 2 L9 7 L6 10 Q10 17 15 18 L18 14 L23 19 Q21 25 16 23 Q2 18 1 6 Z').fill();
    else if(kind==='cap')doc.path('M1 8 L12 3 L23 8 L12 13 Z M5 11 L5 17 Q12 22 19 17 L19 11 M23 8 L23 18').stroke();
    else doc.path('M3 1 L15 1 L22 8 L22 23 L3 23 Z M15 1 L15 8 L22 8 M7 12 L17 12 M7 16 L17 16 M7 20 L13 20').stroke();
    doc.restore();
  };
  const gradient=doc.linearGradient(26,49,1400,290).stop(0,'#084d65').stop(1,'#002e42');
  box(26,49,1374,241,gradient,12);
  doc.save().roundedRect(26,49,1374,241,12).clip();
  doc.path('M26 149 L145 49 L26 49 Z M1118 257 L1400 49 L1400 257 Z').fill('#07445a');
  doc.rect(26,257,1374,33).fill(gold);doc.restore();
  doc.image(logo,80,78,{fit:[145,161],align:'center',valign:'center'});
  text('ADMIT CARD',313,55,800,76,true,'#ffffff',{font:'Times-Bold',align:'center'});
  line(313,134,1113,134,gold,3);
  text('SHREE RAM PUBLIC SCHOOL',300,148,828,44,true,'#ffffff',{font:'Times-Bold',align:'center'});
  text('Kanhra-Badhra Road, Charkhi Dadri, Haryana 127306',317,195,793,24,false,'#ffffff',{align:'center'});
  box(399,225,628,40,gold,22);text('SHREE 2026 OLYMPIAD',409,232,608,30,true,navy,{align:'center'});
  line(1236,121,1236,229,gold,2);
  for(const yy of [118,149,180,229])line(1254,yy,1367,yy,'#a7c5cf');
  text('DISCIPLINE',1254,127,125,14,false,'#ffffff',{characterSpacing:2});
  text('KNOWLEDGE',1254,159,125,14,false,'#ffffff',{characterSpacing:2});
  text('BRIGHTER\nTOMORROW',1254,189,125,14,false,'#ffffff',{characterSpacing:2,lineGap:4});
  text('LEARN   |   COMPETE   |   GROW',60,269,600,14,true,navy,{characterSpacing:2});
  text('A BRIGHTER TOMORROW BEGINS HERE',952,269,415,14,true,navy,{align:'right',characterSpacing:1.5});
  doc.roundedRect(27,301,1372,305,10).lineWidth(1).strokeColor('#69aed0').stroke();
  const section=(y,title,tag,kind='file')=>{
    box(39,y,1349,45,doc.linearGradient(39,y,1388,y+45).stop(0,teal).stop(0.6,'#105b76').stop(1,teal),8);
    doc.rect(39,y+25,1349,20).fill(teal);
    icon(kind,65,y+8,29,'#ffffff');text(title,121,y+12,850,25,true,'#ffffff',{characterSpacing:1.5});
    text(tag,1000,y+16,363,15,false,'#ffffff',{align:'right',characterSpacing:3});
  };
  section(310,'CANDIDATE INFORMATION','SHREE 2026 OLYMPIAD','person');
  const field=(label,value,x,y,w,labelW,kind)=>{
    box(x,y,46,45,'#e3f2f9');icon(kind,x+10,y+9,27);
    text(label,x+68,y+14,labelW-70,19,true);text(':',x+labelW,y+13,14,20,true);
    box(x+labelW+24,y,w-labelW-24,45,pale,3);
    fit(value,x+labelW+37,y+13,w-labelW-48,31,20);
  };
  field('Registration No.',student.registrationNumber,59,371,528,247,'file');
  field('Student Name',student.studentName,59,425,528,247,'person');
  field('Guardian Name',student.guardianName,59,478,528,247,'person');
  field('Class',student.studentClass,59,532,528,247,'cap');
  line(609,369,609,584);line(1017,363,1017,584);
  field('Date of Birth',student.dob,633,371,368,204,'calendar');
  field('Mobile',`******${student.guardianPhone.slice(-4)}`,633,425,368,204,'phone');
  doc.rect(1038,364,153,186).lineWidth(1).strokeColor('#548caf').stroke();
  if(student.photoPath && fs.existsSync(student.photoPath)){
    doc.save();try{doc.rect(1043,370,142,174).clip();doc.image(student.photoPath,1043,370,{cover:[142,174],align:'center',valign:'center'});}catch{}finally{doc.restore();}
  }
  doc.rect(1215,364,154,176).strokeColor('#b6d5e5').stroke();doc.image(qr,1227,376,{width:130,height:130});
  text('SCAN TO VERIFY',1219,514,146,14,true,navy,{align:'center'});
  line(1038,567,1369,567,navy,1.5);text('Candidate Signature',1147,576,220,14,true,navy,{align:'center'});
  box(26,616,1374,47,teal,10);doc.rect(26,645,1374,18).fill(teal);
  icon('file',51,625,28,'#ffffff');text('EXAMINATION DETAILS',103,631,850,24,true,'#ffffff',{characterSpacing:1});
  text('FOR A FAIRER, BRIGHTER TOMORROW',1020,634,354,14,false,'#ffffff',{characterSpacing:2,align:'right'});
  const rows=[['Subject / Exam','SHREE 2026 OLYMPIAD'],['Exam Date',settings.examDate || 'To be announced'],['Reporting Time',settings.reportingTime || 'To be announced'],['Exam Time',settings.examTime || 'To be announced'],['Venue',settings.venue || 'Shree Ram Public School']];
  rows.forEach(([label,value],i)=>{const y=663+i*37;doc.rect(27,y,306,37).fill('#e7f5fd');line(27,y+37,1399,y+37);text(label,47,y+11,280,19,true);fit(value,359,y+11,1017,27,20);});
  line(333,663,333,848);doc.roundedRect(27,616,1372,234,10).lineWidth(1).strokeColor('#69aed0').stroke();
  box(26,865,1374,153,'#fff9e9',9);doc.roundedRect(26,865,1374,153,9).strokeColor(gold).stroke();
  doc.circle(73,897,24).fill('#c99b2a');text('!',63,878,20,37,true,'#ffffff',{font:'Times-Bold',align:'center'});
  text('IMPORTANT INSTRUCTIONS',130,886,340,24,true);line(131,915,441,915,'#dba831',1.5);line(459,898,1373,898,'#dba831',1.5);
  (settings.instructions || []).slice(0,4).forEach((value,i)=>{
    const x=i<2?75:730,y=944+(i%2)*38;
    doc.circle(x,y,16).fill('#cf9e2a');text(i+1,x-9,y-9,18,19,false,'#ffffff',{align:'center'});
    fit(value,x+33,y-8,i<2?593:614,32,18);
  });
  box(0,1031,1426,47,teal,12);doc.rect(0,1031,1426,20).fill(teal);line(0,1031,1426,1031,gold,3);
  line(73,1054,457,1054,gold,2);line(956,1054,1353,1054,gold,2);
  text('EDUCATION FOR A BETTER TOMORROW',498,1050,430,13,false,'#ffffff',{align:'center',characterSpacing:4});
  doc.end();
}
