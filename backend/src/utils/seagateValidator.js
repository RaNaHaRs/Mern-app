/**
 * Seagate Date Code Validator & Parser
 * Validates YYWWD, YYWD, and YWD formats
 * Calculates perfect manufacturing date
 */

const SEAGATE_WEEKS_PER_YEAR = 52;
const JANUARY_1_1970 = new Date('1970-01-01');

/**
 * Validate and parse Seagate date code formats
 * Supported formats:
 * - YYWWD: Year, Week, Day (5 digits) - Most common
 * - YYWD:  Year, Week, Day (4 digits) - Compressed
 * - YWD:   Year, Week, Day (3 digits) - Short
 * 
 * @param {string} dateCode - Raw date code string
 * @returns {Object} { isValid: bool, format: string, year: number, week: number, day: number, perfectDate: string|null, error: string|null }
 */
function validateSeagateDateCode(dateCode) {
  if (!dateCode || typeof dateCode !== 'string') {
    return { isValid: false, format: null, error: 'Date code must be a non-empty string' };
  }

  const trimmed = dateCode.trim().toUpperCase();
  
  // Try YYWWD format (5 digits): Year (2) + Week (2) + Day (1)
  const yywwdMatch = trimmed.match(/^(\d{2})(\d{2})(\d)$/);
  if (yywwdMatch) {
    const year = parseInt(yywwdMatch[1], 10);
    const week = parseInt(yywwdMatch[2], 10);
    const day = parseInt(yywwdMatch[3], 10);
    
    const validation = validateYearWeekDay(year, week, day);
    if (!validation.isValid) {
      return { isValid: false, format: 'YYWWD', error: validation.error };
    }
    
    const perfectDate = calculatePerfectDate(year, week, day);
    return {
      isValid: true,
      format: 'YYWWD',
      year: year + 2000, // Convert to full year
      week,
      day,
      perfectDate,
      rawYear: year,
    };
  }

  // Try YYWD format (4 digits): Year (2) + Week (2), no day separator
  const yywdMatch = trimmed.match(/^(\d{2})(\d{2})$/);
  if (yywdMatch) {
    const year = parseInt(yywdMatch[1], 10);
    const week = parseInt(yywdMatch[2], 10);
    const day = 1; // Default to day 1 if not specified
    
    const validation = validateYearWeekDay(year, week, day);
    if (!validation.isValid) {
      return { isValid: false, format: 'YYWD', error: validation.error };
    }
    
    const perfectDate = calculatePerfectDate(year, week, day);
    return {
      isValid: true,
      format: 'YYWD',
      year: year + 2000,
      week,
      day,
      perfectDate,
      rawYear: year,
    };
  }

  // Try YWD format (3 digits): Year (1) + Week (2)
  const ywdMatch = trimmed.match(/^(\d)(\d{2})$/);
  if (ywdMatch) {
    const year = parseInt(ywdMatch[1], 10);
    const week = parseInt(ywdMatch[2], 10);
    const day = 1; // Default to day 1 if not specified
    
    const validation = validateYearWeekDay(year, week, day);
    if (!validation.isValid) {
      return { isValid: false, format: 'YWD', error: validation.error };
    }
    
    // For single digit year, determine century (0-9 = 2010-2019 era)
    const fullYear = 2000 + (year * 10);
    const perfectDate = calculatePerfectDate(year, week, day, fullYear);
    return {
      isValid: true,
      format: 'YWD',
      year: fullYear,
      week,
      day,
      perfectDate,
      rawYear: year,
    };
  }

  return {
    isValid: false,
    format: null,
    error: `Invalid format. Supported: YYWWD (5 digits), YYWD (4 digits), YWD (3 digits). Received: ${trimmed}`,
  };
}

/**
 * Validate year, week, day components
 */
function validateYearWeekDay(year, week, day) {
  if (week < 1 || week > SEAGATE_WEEKS_PER_YEAR) {
    return { isValid: false, error: `Week must be 1-${SEAGATE_WEEKS_PER_YEAR}, got ${week}` };
  }

  if (day < 0 || day > 9) {
    return { isValid: false, error: `Day must be 0-9, got ${day}` };
  }

  return { isValid: true };
}

/**
 * Calculate perfect manufacturing date from YYWWD components
 * Monday of week 1 is Jan 1 (if Jan 1 is Mon-Thu)
 * Otherwise, week 1 starts next Monday
 * 
 * @param {number} year - Two-digit year (00-99)
 * @param {number} week - Week number (1-52)
 * @param {number} day - Day number (0-9, where 1=Mon, 7=Sun, 0=unknown/MFG week start)
 * @param {number} fullYear - Override for full year calculation (for YWD format)
 * @returns {string} ISO date string (YYYY-MM-DD)
 */
function calculatePerfectDate(year, week, day, fullYear = null) {
  // Default to 20xx century for two-digit years
  let actualYear = fullYear || (2000 + year);

  // If year >= 50, assume 19xx (earlier decades)
  if (!fullYear && year >= 50) {
    actualYear = 1900 + year;
  }

  // Calculate ISO week date
  // ISO 8601: Week 1 is the week with Jan 4th
  // But Seagate uses: Monday of week 1 is Jan 1 (if Mon-Thu), else first Monday
  
  // Get Jan 1 of the year
  const jan1 = new Date(actualYear, 0, 1);
  const jan1DayOfWeek = jan1.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

  // Calculate first Monday of the year
  let firstMonday;
  if (jan1DayOfWeek === 0 || jan1DayOfWeek === 6) {
    // Jan 1 is Sat or Sun, so first Monday is in Jan
    firstMonday = new Date(actualYear, 0, (9 - jan1DayOfWeek));
  } else {
    // Jan 1 is Mon-Fri, so first Monday is Jan 1 or close
    firstMonday = new Date(actualYear, 0, (1 + (8 - jan1DayOfWeek) % 7));
  }

  // Week 1 starts on the first Monday
  const weekStartDate = new Date(firstMonday);
  weekStartDate.setDate(weekStartDate.getDate() + (week - 1) * 7);

  // Add day offset (1=Monday, 7=Sunday, 0=Monday of that week)
  const dayOfWeekOffset = day === 0 ? 0 : (day - 1);
  const perfectDate = new Date(weekStartDate);
  perfectDate.setDate(perfectDate.getDate() + dayOfWeekOffset);

  // Return ISO date string
  return perfectDate.toISOString().split('T')[0];
}

/**
 * Export for use in backend routes and frontend
 */
module.exports = {
  validateSeagateDateCode,
  calculatePerfectDate,
  SEAGATE_WEEKS_PER_YEAR,
};
