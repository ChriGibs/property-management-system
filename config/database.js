require('dotenv').config();
const { Sequelize } = require('sequelize');

// Database configuration that works both locally and in production
const databaseConfig = {
  development: {
    use_env_variable: 'DATABASE_URL',
    dialect: 'postgres',
    dialectOptions: {
      ssl: false
    },
    logging: console.log
  },
  production: {
    use_env_variable: 'DATABASE_URL',
    dialect: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false // For Heroku
      }
    },
    logging: false
  }
};

const env = process.env.NODE_ENV || 'development';
const config = databaseConfig[env];

let sequelize;
if (config.use_env_variable) {
  sequelize = new Sequelize(process.env[config.use_env_variable], {
    dialect: config.dialect,
    dialectOptions: config.dialectOptions,
    logging: config.logging
  });
} else {
  sequelize = new Sequelize(config.database, config.username, config.password, config);
}

module.exports = sequelize; 