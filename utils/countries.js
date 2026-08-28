/**
 * ISO 3166-1 alpha-2 countries + sparse legal/address profiles.
 * Labels are English defaults; admin i18n can override via labelKey.
 */

const COUNTRIES = [
  ["AF", "Afghanistan"],
  ["AL", "Albania"],
  ["DZ", "Algeria"],
  ["AD", "Andorra"],
  ["AO", "Angola"],
  ["AG", "Antigua and Barbuda"],
  ["AR", "Argentina"],
  ["AM", "Armenia"],
  ["AU", "Australia"],
  ["AT", "Austria"],
  ["AZ", "Azerbaijan"],
  ["BS", "Bahamas"],
  ["BH", "Bahrain"],
  ["BD", "Bangladesh"],
  ["BB", "Barbados"],
  ["BY", "Belarus"],
  ["BE", "Belgium"],
  ["BZ", "Belize"],
  ["BJ", "Benin"],
  ["BT", "Bhutan"],
  ["BO", "Bolivia"],
  ["BA", "Bosnia and Herzegovina"],
  ["BW", "Botswana"],
  ["BR", "Brazil"],
  ["BN", "Brunei"],
  ["BG", "Bulgaria"],
  ["BF", "Burkina Faso"],
  ["BI", "Burundi"],
  ["CV", "Cabo Verde"],
  ["KH", "Cambodia"],
  ["CM", "Cameroon"],
  ["CA", "Canada"],
  ["CF", "Central African Republic"],
  ["TD", "Chad"],
  ["CL", "Chile"],
  ["CN", "China"],
  ["CO", "Colombia"],
  ["KM", "Comoros"],
  ["CG", "Congo"],
  ["CD", "Congo (DRC)"],
  ["CR", "Costa Rica"],
  ["CI", "Côte d'Ivoire"],
  ["HR", "Croatia"],
  ["CU", "Cuba"],
  ["CY", "Cyprus"],
  ["CZ", "Czechia"],
  ["DK", "Denmark"],
  ["DJ", "Djibouti"],
  ["DM", "Dominica"],
  ["DO", "Dominican Republic"],
  ["EC", "Ecuador"],
  ["EG", "Egypt"],
  ["SV", "El Salvador"],
  ["GQ", "Equatorial Guinea"],
  ["ER", "Eritrea"],
  ["EE", "Estonia"],
  ["SZ", "Eswatini"],
  ["ET", "Ethiopia"],
  ["FJ", "Fiji"],
  ["FI", "Finland"],
  ["FR", "France"],
  ["GA", "Gabon"],
  ["GM", "Gambia"],
  ["GE", "Georgia"],
  ["DE", "Germany"],
  ["GH", "Ghana"],
  ["GR", "Greece"],
  ["GD", "Grenada"],
  ["GT", "Guatemala"],
  ["GN", "Guinea"],
  ["GW", "Guinea-Bissau"],
  ["GY", "Guyana"],
  ["HT", "Haiti"],
  ["HN", "Honduras"],
  ["HU", "Hungary"],
  ["IS", "Iceland"],
  ["IN", "India"],
  ["ID", "Indonesia"],
  ["IR", "Iran"],
  ["IQ", "Iraq"],
  ["IE", "Ireland"],
  ["IL", "Israel"],
  ["IT", "Italy"],
  ["JM", "Jamaica"],
  ["JP", "Japan"],
  ["JO", "Jordan"],
  ["KZ", "Kazakhstan"],
  ["KE", "Kenya"],
  ["KI", "Kiribati"],
  ["KP", "North Korea"],
  ["KR", "South Korea"],
  ["KW", "Kuwait"],
  ["KG", "Kyrgyzstan"],
  ["LA", "Laos"],
  ["LV", "Latvia"],
  ["LB", "Lebanon"],
  ["LS", "Lesotho"],
  ["LR", "Liberia"],
  ["LY", "Libya"],
  ["LI", "Liechtenstein"],
  ["LT", "Lithuania"],
  ["LU", "Luxembourg"],
  ["MG", "Madagascar"],
  ["MW", "Malawi"],
  ["MY", "Malaysia"],
  ["MV", "Maldives"],
  ["ML", "Mali"],
  ["MT", "Malta"],
  ["MH", "Marshall Islands"],
  ["MR", "Mauritania"],
  ["MU", "Mauritius"],
  ["MX", "Mexico"],
  ["FM", "Micronesia"],
  ["MD", "Moldova"],
  ["MC", "Monaco"],
  ["MN", "Mongolia"],
  ["ME", "Montenegro"],
  ["MA", "Morocco"],
  ["MZ", "Mozambique"],
  ["MM", "Myanmar"],
  ["NA", "Namibia"],
  ["NR", "Nauru"],
  ["NP", "Nepal"],
  ["NL", "Netherlands"],
  ["NZ", "New Zealand"],
  ["NI", "Nicaragua"],
  ["NE", "Niger"],
  ["NG", "Nigeria"],
  ["MK", "North Macedonia"],
  ["NO", "Norway"],
  ["OM", "Oman"],
  ["PK", "Pakistan"],
  ["PW", "Palau"],
  ["PS", "Palestine"],
  ["PA", "Panama"],
  ["PG", "Papua New Guinea"],
  ["PY", "Paraguay"],
  ["PE", "Peru"],
  ["PH", "Philippines"],
  ["PL", "Poland"],
  ["PT", "Portugal"],
  ["QA", "Qatar"],
  ["RO", "Romania"],
  ["RU", "Russia"],
  ["RW", "Rwanda"],
  ["KN", "Saint Kitts and Nevis"],
  ["LC", "Saint Lucia"],
  ["VC", "Saint Vincent and the Grenadines"],
  ["WS", "Samoa"],
  ["SM", "San Marino"],
  ["ST", "Sao Tome and Principe"],
  ["SA", "Saudi Arabia"],
  ["SN", "Senegal"],
  ["RS", "Serbia"],
  ["SC", "Seychelles"],
  ["SL", "Sierra Leone"],
  ["SG", "Singapore"],
  ["SK", "Slovakia"],
  ["SI", "Slovenia"],
  ["SB", "Solomon Islands"],
  ["SO", "Somalia"],
  ["ZA", "South Africa"],
  ["SS", "South Sudan"],
  ["ES", "Spain"],
  ["LK", "Sri Lanka"],
  ["SD", "Sudan"],
  ["SR", "Suriname"],
  ["SE", "Sweden"],
  ["CH", "Switzerland"],
  ["SY", "Syria"],
  ["TW", "Taiwan"],
  ["TJ", "Tajikistan"],
  ["TZ", "Tanzania"],
  ["TH", "Thailand"],
  ["TL", "Timor-Leste"],
  ["TG", "Togo"],
  ["TO", "Tonga"],
  ["TT", "Trinidad and Tobago"],
  ["TN", "Tunisia"],
  ["TR", "Turkey"],
  ["TM", "Turkmenistan"],
  ["TV", "Tuvalu"],
  ["UG", "Uganda"],
  ["UA", "Ukraine"],
  ["AE", "United Arab Emirates"],
  ["GB", "United Kingdom"],
  ["US", "United States"],
  ["UY", "Uruguay"],
  ["UZ", "Uzbekistan"],
  ["VU", "Vanuatu"],
  ["VA", "Vatican City"],
  ["VE", "Venezuela"],
  ["VN", "Vietnam"],
  ["YE", "Yemen"],
  ["ZM", "Zambia"],
  ["ZW", "Zimbabwe"],
];

const DEFAULT_COUNTRY_CODE = "DE";

/** Fallback for countries without a commercial-register scheme (IN, etc.). */
const GENERIC_LEGAL = {
  registry: {
    visible: true,
    requiredForPublish: false,
    label: "Legal form / company type",
    labelKey: "legal_registry",
    placeholder: "e.g. Partnership, Pvt Ltd, Sole proprietorship",
    placeholderKey: "legal_registry_ph",
  },
  registry_number: {
    visible: true,
    requiredForPublish: false,
    label: "Registration number",
    labelKey: "legal_registry_number",
    placeholder: "e.g. company / registration no. (if any)",
    placeholderKey: "legal_registry_number_ph",
  },
  taxId: {
    visible: true,
    requiredForPublish: false,
    label: "Tax ID",
    labelKey: "legal_tax_id",
    placeholder: "e.g. national tax ID",
    placeholderKey: "legal_tax_id_ph",
  },
  vat_number: {
    visible: true,
    requiredForPublish: false,
    label: "VAT / GST number",
    labelKey: "legal_vat_number",
    placeholder: "e.g. VAT / GSTIN (if any)",
    placeholderKey: "legal_vat_number_ph",
  },
};

/** Sparse overrides. Unlisted countries inherit GENERIC_LEGAL + loose postal. */
const COUNTRY_PROFILES = {
  DE: {
    postalPattern: /^\d{5}$/,
    postalPlaceholder: "63450",
    legal: {
      registry: { visible: true, label: "Registry court", labelKey: "legal_registry_de" },
      registry_number: {
        visible: true,
        label: "Commercial register no.",
        labelKey: "legal_registry_number_de",
      },
      taxId: { visible: true, label: "Tax ID", labelKey: "legal_tax_id_de" },
      vat_number: { visible: true, label: "VAT ID (USt-IdNr.)", labelKey: "legal_vat_de" },
    },
  },
  AT: {
    postalPattern: /^\d{4}$/,
    postalPlaceholder: "1010",
    legal: {
      registry: { visible: true, label: "Firmenbuchgericht", labelKey: "legal_registry_at" },
      registry_number: {
        visible: true,
        label: "Firmenbuchnummer",
        labelKey: "legal_registry_number_at",
      },
      taxId: { visible: true, label: "Steuernummer", labelKey: "legal_tax_id_at" },
      vat_number: { visible: true, label: "UID-Nummer", labelKey: "legal_vat_at" },
    },
  },
  CH: {
    postalPattern: /^\d{4}$/,
    postalPlaceholder: "8001",
    legal: {
      registry: { visible: true, label: "Handelsregister", labelKey: "legal_registry_ch" },
      registry_number: {
        visible: true,
        label: "UID / CHE number",
        labelKey: "legal_registry_number_ch",
      },
      taxId: { visible: true, label: "Tax ID", labelKey: "legal_tax_id_ch" },
      vat_number: { visible: true, label: "MWST number", labelKey: "legal_vat_ch" },
    },
  },
  NL: {
    postalPattern: /^\d{4}\s?[A-Za-z]{2}$/,
    postalPlaceholder: "1012 AB",
    legal: {
      registry: { visible: true, label: "KvK chamber", labelKey: "legal_registry_nl" },
      registry_number: {
        visible: true,
        label: "KvK number",
        labelKey: "legal_registry_number_nl",
      },
      taxId: { visible: true, label: "RSIN / Tax ID", labelKey: "legal_tax_id_nl" },
      vat_number: { visible: true, label: "BTW number", labelKey: "legal_vat_nl" },
    },
  },
  FR: {
    postalPattern: /^\d{5}$/,
    postalPlaceholder: "75001",
    legal: {
      registry: { visible: true, label: "RCS / Greffe", labelKey: "legal_registry_fr" },
      registry_number: {
        visible: true,
        label: "SIRET / SIREN",
        labelKey: "legal_registry_number_fr",
      },
      taxId: { visible: true, label: "Tax ID", labelKey: "legal_tax_id_fr" },
      vat_number: { visible: true, label: "TVA number", labelKey: "legal_vat_fr" },
    },
  },
  GB: {
    postalPattern: /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i,
    postalPlaceholder: "SW1A 1AA",
    legal: {
      registry: { visible: true, label: "Companies House", labelKey: "legal_registry_gb" },
      registry_number: {
        visible: true,
        label: "Company number",
        labelKey: "legal_registry_number_gb",
      },
      taxId: { visible: true, label: "UTR / Tax ID", labelKey: "legal_tax_id_gb" },
      vat_number: { visible: true, label: "VAT number", labelKey: "legal_vat_gb" },
    },
  },
  US: {
    postalPattern: /^\d{5}(-\d{4})?$/,
    postalPlaceholder: "10001",
    legal: {
      registry: { visible: false, label: "Registry", labelKey: "legal_registry" },
      registry_number: {
        visible: false,
        label: "Registry number",
        labelKey: "legal_registry_number",
      },
      taxId: { visible: true, label: "EIN / Tax ID", labelKey: "legal_tax_id_us" },
      vat_number: { visible: false, label: "Sales tax ID", labelKey: "legal_vat_us" },
    },
  },
  IN: {
    postalPattern: /^\d{6}$/,
    postalPlaceholder: "110001",
    legal: {
      registry: {
        visible: true,
        label: "Company type",
        labelKey: "legal_registry_in",
        placeholder: "e.g. Partnership firm, Sole proprietorship, Pvt Ltd",
        placeholderKey: "legal_registry_in_ph",
      },
      registry_number: {
        visible: true,
        label: "CIN / registration number",
        labelKey: "legal_registry_number_in",
        placeholder: "e.g. CIN (if company)",
        placeholderKey: "legal_registry_number_in_ph",
      },
      taxId: {
        visible: true,
        label: "PAN / Tax ID",
        labelKey: "legal_tax_id_in",
        placeholder: "e.g. ABCDE1234F",
        placeholderKey: "legal_tax_id_in_ph",
      },
      vat_number: {
        visible: true,
        label: "GSTIN",
        labelKey: "legal_vat_in",
        placeholder: "e.g. 22AAAAA0000A1Z5",
        placeholderKey: "legal_vat_in_ph",
      },
    },
  },
};

/** Legal fields required to publish / go visible, by country. Unlisted = soft (none). */
const PUBLISH_REQUIRED_LEGAL = {
  DE: ["registry", "registry_number", "taxId"],
  AT: ["registry", "registry_number", "taxId"],
  CH: ["registry", "registry_number", "taxId"],
  NL: ["registry", "registry_number", "taxId"],
  FR: ["registry", "registry_number", "taxId"],
  GB: ["registry", "registry_number", "taxId"],
  // US / IN and others: no registry/tax gate for storefront publish
  US: [],
  IN: [],
};

const countryByCode = new Map(
  COUNTRIES.map(([code, name]) => [code, { code, name }])
);

function normalizeCountryCode(value) {
  const code = String(value || "")
    .trim()
    .toUpperCase();
  if (!code) return null;
  return countryByCode.has(code) ? code : null;
}

function getCountryByCode(code) {
  const normalized = normalizeCountryCode(code);
  return normalized ? countryByCode.get(normalized) : null;
}

function getCountryByName(name) {
  const needle = String(name || "")
    .trim()
    .toLowerCase();
  if (!needle) return null;
  for (const country of countryByCode.values()) {
    if (country.name.toLowerCase() === needle) return country;
  }
  // Common aliases
  if (needle === "deutschland") return countryByCode.get("DE");
  if (needle === "uk" || needle === "great britain") return countryByCode.get("GB");
  if (needle === "usa" || needle === "united states of america") {
    return countryByCode.get("US");
  }
  return null;
}

function listCountries() {
  return COUNTRIES.map(([code, name]) => ({ code, name }));
}

function getCountryProfile(code) {
  const normalized = normalizeCountryCode(code) || DEFAULT_COUNTRY_CODE;
  const country = getCountryByCode(normalized);
  const override = COUNTRY_PROFILES[normalized] || {};
  const legal = {
    registry: { ...GENERIC_LEGAL.registry, ...(override.legal?.registry || {}) },
    registry_number: {
      ...GENERIC_LEGAL.registry_number,
      ...(override.legal?.registry_number || {}),
    },
    taxId: { ...GENERIC_LEGAL.taxId, ...(override.legal?.taxId || {}) },
    vat_number: { ...GENERIC_LEGAL.vat_number, ...(override.legal?.vat_number || {}) },
  };

  const publishRequired = new Set(PUBLISH_REQUIRED_LEGAL[normalized] || []);
  for (const key of Object.keys(legal)) {
    legal[key].requiredForPublish = publishRequired.has(key);
  }

  return {
    code: normalized,
    name: country?.name || "Germany",
    postalPattern: override.postalPattern || null,
    postalPlaceholder: override.postalPlaceholder || "",
    legal,
  };
}

/** Core identity fields always required to publish, plus country-specific legal fields. */
function getRequiredPublishFields(countryCode) {
  const profile = getCountryProfile(countryCode);
  const legalKeys = ["registry", "registry_number", "taxId", "vat_number"].filter(
    (key) => profile.legal[key]?.visible && profile.legal[key]?.requiredForPublish
  );
  return ["ownerName", "companyName", "phoneNumber", ...legalKeys];
}

function isValidPostalCode(code, postalCode) {
  const profile = getCountryProfile(code);
  const value = String(postalCode || "").trim();
  if (!value) return false;
  if (profile.postalPattern) return profile.postalPattern.test(value);
  return value.length >= 2 && value.length <= 16;
}

function resolveCountryFromAddress(address = {}, fallbackCode = DEFAULT_COUNTRY_CODE) {
  const fromCode = getCountryByCode(address.countryCode);
  if (fromCode) return fromCode;
  const fromName = getCountryByName(address.country);
  if (fromName) return fromName;
  return getCountryByCode(fallbackCode) || getCountryByCode(DEFAULT_COUNTRY_CODE);
}

module.exports = {
  DEFAULT_COUNTRY_CODE,
  GENERIC_LEGAL,
  COUNTRY_PROFILES,
  PUBLISH_REQUIRED_LEGAL,
  listCountries,
  getCountryByCode,
  getCountryByName,
  normalizeCountryCode,
  getCountryProfile,
  getRequiredPublishFields,
  isValidPostalCode,
  resolveCountryFromAddress,
};
