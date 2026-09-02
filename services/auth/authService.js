/**
 * Auth service facade — business logic remains in appUserController;
 * token and email flows are delegated to dedicated modules.
 */
const authTokenService = require("./authTokenService");
const authEmailService = require("./authEmailService");

module.exports = {
  ...authTokenService,
  ...authEmailService,
};
