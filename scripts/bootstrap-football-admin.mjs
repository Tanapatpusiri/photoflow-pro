import {Pool} from 'pg';
import {scryptSync,randomBytes} from 'node:crypto';
const {DATABASE_URL,FG_ADMIN_EMAIL,FG_ADMIN_PASSWORD}=process.env;
if(!DATABASE_URL||!FG_ADMIN_EMAIL||!FG_ADMIN_PASSWORD||FG_ADMIN_PASSWORD.length<14){
 console.error('Set DATABASE_URL, FG_ADMIN_EMAIL and FG_ADMIN_PASSWORD (14+ chars) securely before running.');process.exit(1);
}
const salt=randomBytes(16).toString('hex');
const passwordHash='scrypt$'+salt+'$'+scryptSync(FG_ADMIN_PASSWORD,salt,64).toString('hex');
const pool=new Pool({connectionString:DATABASE_URL,ssl:process.env.DATABASE_SSL==='disable'?false:{rejectUnauthorized:true}});
try{
 await pool.query(`INSERT INTO fg_admins(email,password_hash,role,enabled) VALUES($1,$2,'owner',true) ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash,enabled=true`,[FG_ADMIN_EMAIL.trim().toLowerCase(),passwordHash]);
 console.log('Owner account created or updated. Remove bootstrap password from the environment after use.');
}catch(e){console.error('Bootstrap failed:',e.code||e.message);process.exitCode=1}finally{await pool.end()}
