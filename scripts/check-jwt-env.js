require('dotenv').config({ path: '../.env' });

console.log('🔍 JWT Environment Variables Check:');
console.log('===================================');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? '✅ Set' : '❌ NOT SET');
console.log('JWT_REFRESH_SECRET:', process.env.JWT_REFRESH_SECRET ? '✅ Set' : '❌ NOT SET');
console.log('JWT_EXPIRATION:', process.env.JWT_EXPIRATION || '❌ NOT SET (using default 15m)');
console.log('JWT_REFRESH_EXPIRATION:', process.env.JWT_REFRESH_EXPIRATION || '❌ NOT SET (using default 7d)');

if (!process.env.JWT_SECRET) {
  console.log('\n⚠️  WARNING: JWT_SECRET is not set!');
  console.log('Add this to your .env file:');
  console.log('JWT_SECRET=your-super-secret-key-change-this');
  console.log('JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-this');
}