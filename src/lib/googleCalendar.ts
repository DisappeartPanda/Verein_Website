export async function getGoogleEvents() {
  const calendarId = import.meta.env.PUBLIC_GOOGLE_CALENDAR_ID;
  const apiKey = import.meta.env.PUBLIC_GOOGLE_API_KEY;

  if (!calendarId || !apiKey) {
    console.error("Google Calendar ENV fehlt");
    return [];
  }

  const url =
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId
    )}/events` +
    `?key=${apiKey}&singleEvents=true&orderBy=startTime&timeMin=${new Date().toISOString()}`;

  const res = await fetch(url);

  if (!res.ok) {
    console.error("Google API Fehler:", await res.text());
    return [];
  }

  const data = await res.json();
  return data.items || [];
}
