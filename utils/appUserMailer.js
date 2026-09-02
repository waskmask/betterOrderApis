const { sendTransactionalEmail, sendAppUserEmail } = require("../services/email/transactionalEmailService");

module.exports = {
  sendAppUserEmail,
  sendTransactionalEmail,
};
