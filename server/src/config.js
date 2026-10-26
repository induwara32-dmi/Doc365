// Reads settings from environment variables (loaded from the .env file).
// If a required setting is missing, stop right away with a clear message.

const required = ['DATABASE_URL', 'JWT_SECRET', 'PORT'];

for (const name of required) {
  if (!process.env[name]) {
    console.error(`Missing setting ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
}

export const config = {
  port: Number(process.env.PORT),
  jwtSecret: process.env.JWT_SECRET,
  accessDaysTreatment: Number(process.env.ACCESS_DAYS_TREATMENT ?? 90),
};
