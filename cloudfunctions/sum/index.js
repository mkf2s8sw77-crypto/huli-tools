const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const { a = 0, b = 0 } = event;
  return {
    result: a + b,
  };
};
