// Reads settings from environment variables (loaded from the .env file).
// If a required setting is missing, stop right away with a clear message.

const required = ['DATABASE_URL', 'JWT_SECRET', 'PORT'];

for (const name of required) {
  if (!process.env[name]) {
    console.error(`Missing setting ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
}

// A short secret makes tokens easy to forge (CLAUDE.md: approved security decisions)
const MIN_JWT_SECRET_LENGTH = 32;
if (process.env.JWT_SECRET.length < MIN_JWT_SECRET_LENGTH) {
  console.error(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters long.`);
  process.exit(1);
}

export const config = {
  port: Number(process.env.PORT),
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: '15m',
  accessDaysTreatment: Number(process.env.ACCESS_DAYS_TREATMENT ?? 90),
};
