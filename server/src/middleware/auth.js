import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { Admin } from '../models/index.js';
const secret=()=>process.env.JWT_SECRET;
export function issueToken(data, expiresIn='20m'){return jwt.sign(data,secret(),{expiresIn,issuer:'shree-olympiad'});}
export function authenticate(scope){return async (req,res,next)=>{try{let token;if(scope==='admin'){token=req.cookies?.olympiad_admin;}else{const auth=req.headers.authorization||'';token=auth.startsWith('Bearer ')?auth.substring(7):null;}if(!token)return res.status(401).json({error:'Authentication required.'});const payload=jwt.verify(token,secret(),{issuer:'shree-olympiad'});if(payload.scope!==scope)return res.status(403).json({error:'Wrong authorization scope.'});if(scope==='admin'){const admin=await Admin.findById(payload.sub).select('-passwordHash');if(!admin?.active)return res.status(401).json({error:'Admin account inactive.'});req.admin=admin;}else req.viewer=payload;next();}catch(e){res.status(401).json({error:'Session expired or invalid. Please sign in again.'});}};}
export function adminRoles(...roles){return (req,res,next)=>{if(!req.admin||!roles.includes(req.admin.role))return res.status(403).json({error:'Insufficient permission.'});next();};}
export function randomToken(){return crypto.randomBytes(24).toString('hex');}
