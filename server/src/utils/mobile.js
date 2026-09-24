export const normalizeIndianMobile = (value) => {
  const input = String(value ?? "")
    .trim()
    .replace(/[\s()-]/g, "");
  if (/^[6-9][0-9]{9}$/.test(input)) return `+91${input}`;
  if (/^\+91[6-9][0-9]{9}$/.test(input)) return input;
  if (/^0091[6-9][0-9]{9}$/.test(input)) return `+${input.slice(2)}`;
  const error = new Error("Enter a valid 10-digit Indian mobile number.");
  error.status = 400;
  throw error;
};

