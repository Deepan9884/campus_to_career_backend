require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User.model');

async function makeAdmin() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: node scripts/createAdmin.js <email>');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Missing MONGODB_URI in environment');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    console.error(`User with email "${email}" not found. Please register first on the Student portal.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  user.role = 'admin';
  await user.save();

  console.log(`SUCCESS! User ${user.name} (${user.email}) has been granted ADMIN role!`);
  await mongoose.disconnect();
}

makeAdmin().catch((err) => {
 console.error('Error:', err);
 process.exit(1);
});
