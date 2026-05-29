import express from "express";
import path from "path";
import fs from "fs";
import nodemailer from "nodemailer";
import * as admin from "firebase-admin";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import firebaseConfig from "../firebase-applet-config.json";

const app = express();
app.use(express.json({ limit: '100mb' }));

// Initialize Firebase Admin
if (!getApps().length) {
  const serviceAccountVar = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountVar) {
    try {
      const serviceAccount = JSON.parse(serviceAccountVar);
      initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: firebaseConfig.projectId,
      });
    } catch (parseError) {
      initializeApp({ projectId: firebaseConfig.projectId });
    }
  } else {
    initializeApp({ projectId: firebaseConfig.projectId });
  }
}

const firestore = firebaseConfig.firestoreDatabaseId 
  ? getFirestore(getApps()[0], firebaseConfig.firestoreDatabaseId)
  : getFirestore(getApps()[0]);

// Middleware
const authenticate = async (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const idToken = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await getAuth().verifyIdToken(idToken);
    req.user = decodedToken;
    const superAdmins = ["alvicourse@gmail.com", "cdc@creativealvi.com"];
    if (decodedToken.email && superAdmins.includes(decodedToken.email.toLowerCase())) {
      return next();
    }
    const userDoc = await firestore.collection('users').doc(decodedToken.uid).get();
    if (userDoc.exists && userDoc.data()?.role === 'admin') {
      return next();
    }
    res.status(403).json({ error: 'Forbidden' });
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

let mailTransporter: any = null;
const getTransporter = (email: string, pass: string, options?: any) => {
  const smtpHost = options?.host || process.env.SMTP_HOST;
  const smtpPort = options?.port || parseInt(process.env.SMTP_PORT || "465");
  const smtpSecure = options?.secure !== undefined ? options.secure : (process.env.SMTP_SECURE !== "false");
  const transportConfig: any = { auth: { user: email, pass: pass } };
  if (smtpHost) {
    transportConfig.host = smtpHost;
    transportConfig.port = smtpPort;
    transportConfig.secure = smtpSecure;
  } else {
    transportConfig.service = "gmail";
  }
  return nodemailer.createTransport(transportConfig);
};

// API Routes
app.post("/api/send-test-email", authenticate, async (req, res) => {
  const { email, appPassword, testRecipient, smtpHost, smtpPort, smtpSecure } = req.body;
  try {
    const transporter = getTransporter(email, appPassword, { host: smtpHost, port: smtpPort, secure: smtpSecure });
    await transporter.sendMail({
      from: email,
      to: testRecipient,
      subject: "Seminar OS - Test",
      text: "Test successful!",
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/send-certificate", authenticate, async (req, res) => {
    const { to, subject, body, attachmentBase64, fileName, gmailEmail, gmailAppPassword } = req.body;
    try {
        const transporter = getTransporter(gmailEmail, gmailAppPassword);
        await transporter.sendMail({
            from: gmailEmail,
            to,
            subject,
            text: body,
            attachments: attachmentBase64 ? [{ filename: fileName, content: attachmentBase64.split("base64,")[1], encoding: 'base64' }] : []
        });
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// For Vercel, we export the app
export default app;
