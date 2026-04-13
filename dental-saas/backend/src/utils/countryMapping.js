const countryToCode = {
    "Egypt": "EG",
    "Saudi Arabia": "SA",
    "UAE": "AE",
    "Kuwait": "KW",
    "Qatar": "QA",
    "Bahrain": "BH",
    "Oman": "OM",
    "UK": "GB",
    "USA": "US"
};

exports.getCountryCode = (countryName) => {
    return countryToCode[countryName] || null;
};
