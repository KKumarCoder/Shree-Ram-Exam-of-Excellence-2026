import dotenv from 'dotenv';
import path from 'path';
import nodemailer from 'nodemailer';
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';

dotenv.config();

console.log('--- Checking credentials from server/.env ---\n');

// 1. Test MongoDB
async function testMongo() {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    console.log('✅ MongoDB: Connection successful! Database:', conn.connection.name);
    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ MongoDB Error:', err.message);
  }
}

// 2. Test Gmail SMTP
async function testSmtp() {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: Number(process.env.SMTP_PORT) === 465,
      requireTLS: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
    });

    await transporter.verify();
    console.log('✅ Gmail SMTP: App Password valid! Authentication & TLS handshake successful.');
  } catch (err) {
    console.error('❌ Gmail SMTP Error:', err.message);
  }
}

// 3. Test Cloudinary
async function testCloudinary() {
  try {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    const res = await cloudinary.api.ping();
    console.log('✅ Cloudinary: Credentials valid! Ping status:', res.status);
  } catch (err) {
    console.error('❌ Cloudinary Error:', err.message);
  }
}

async function run() {
  await testMongo();
  await testSmtp();
  await testCloudinary();
  console.log('\n--- Credential Check Completed ---');
}

run();
