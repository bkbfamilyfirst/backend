const { Parser } = require('json2csv');

const generateCsv = (data, fields) => {
    const json2csvParser = new Parser({ fields });
    return json2csvParser.parse(data);
};

module.exports = { generateCsv }; 