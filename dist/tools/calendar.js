import { z } from "zod";
import { ok, fail, guard } from "../util.js";
import { accountField } from "../accounts.js";
export function registerCalendarTools(server, clients) {
    const account = accountField(clients);
    server.registerTool("calendar_list", {
        title: "List calendars",
        description: "List all calendars the user has access to.",
        inputSchema: { account },
    }, guard(async ({ account }) => {
        const g = clients.resolve(account);
        const res = await g.calendar.calendarList.list();
        const items = res.data.items ?? [];
        return ok({
            summary: `📅 ${items.length} calendar(s)`,
            calendars: items.map((c) => ({
                id: c.id,
                summary: c.summary,
                primary: c.primary ?? false,
                accessRole: c.accessRole,
                backgroundColor: c.backgroundColor,
            })),
        });
    }));
    server.registerTool("calendar_events_list", {
        title: "List events",
        description: "List events from a calendar within a time range.",
        inputSchema: {
            account,
            calendarId: z
                .string()
                .default("primary")
                .optional()
                .describe("Calendar ID. Use 'primary' for the main calendar."),
            timeMin: z
                .string()
                .optional()
                .describe("Start of time range (RFC3339, e.g. '2024-01-01T00:00:00Z'). Defaults to now."),
            timeMax: z
                .string()
                .optional()
                .describe("End of time range (RFC3339)."),
            query: z.string().optional().describe("Free-text search query."),
            maxResults: z.number().int().min(1).max(250).default(50).optional(),
            orderBy: z.enum(["startTime", "updated"]).default("startTime").optional(),
        },
    }, guard(async ({ account, calendarId, timeMin, timeMax, query, maxResults, orderBy }) => {
        const g = clients.resolve(account);
        const now = new Date().toISOString();
        const res = await g.calendar.events.list({
            calendarId: calendarId ?? "primary",
            timeMin: timeMin ?? now,
            timeMax,
            q: query,
            maxResults: maxResults ?? 50,
            orderBy: orderBy ?? "startTime",
            singleEvents: true,
        });
        const items = res.data.items ?? [];
        return ok({
            summary: `📅 ${items.length} event(s)`,
            events: items.map((e) => ({
                id: e.id,
                summary: e.summary,
                start: e.start?.dateTime ?? e.start?.date,
                end: e.end?.dateTime ?? e.end?.date,
                location: e.location,
                description: e.description,
                status: e.status,
                htmlLink: e.htmlLink,
                attendees: e.attendees?.map((a) => ({ email: a.email, responseStatus: a.responseStatus })),
            })),
        });
    }));
    server.registerTool("calendar_event_get", {
        title: "Get event",
        description: "Get full details of a single calendar event by ID.",
        inputSchema: {
            account,
            calendarId: z.string().default("primary").optional(),
            eventId: z.string().describe("Event ID."),
        },
    }, guard(async ({ account, calendarId, eventId }) => {
        const g = clients.resolve(account);
        const res = await g.calendar.events.get({
            calendarId: calendarId ?? "primary",
            eventId,
        });
        return ok(res.data);
    }));
    server.registerTool("calendar_event_create", {
        title: "Create event",
        description: "Create a new calendar event.",
        inputSchema: {
            account,
            calendarId: z.string().default("primary").optional(),
            summary: z.string().describe("Event title."),
            description: z.string().optional(),
            location: z.string().optional(),
            start: z.string().describe("Start time (RFC3339 e.g. '2024-06-15T10:00:00+03:00') or date ('2024-06-15')."),
            end: z.string().describe("End time (RFC3339) or date."),
            attendees: z
                .array(z.string())
                .optional()
                .describe("List of attendee email addresses."),
            sendUpdates: z.enum(["all", "externalOnly", "none"]).default("all").optional(),
            timeZone: z.string().optional().describe("IANA timezone, e.g. 'Europe/Moscow'. Used when start/end are date-only."),
        },
    }, guard(async ({ account, calendarId, summary, description, location, start, end, attendees, sendUpdates, timeZone }) => {
        const g = clients.resolve(account);
        const isDateTime = start.includes("T");
        const startObj = isDateTime ? { dateTime: start, timeZone } : { date: start, timeZone };
        const endObj = isDateTime ? { dateTime: end, timeZone } : { date: end, timeZone };
        const res = await g.calendar.events.insert({
            calendarId: calendarId ?? "primary",
            sendUpdates: sendUpdates ?? "all",
            requestBody: {
                summary,
                description,
                location,
                start: startObj,
                end: endObj,
                attendees: attendees?.map((email) => ({ email })),
            },
        });
        return ok({
            summary: `✅ Created "${res.data.summary}"`,
            id: res.data.id,
            htmlLink: res.data.htmlLink,
            start: res.data.start,
            end: res.data.end,
        });
    }));
    server.registerTool("calendar_event_update", {
        title: "Update event",
        description: "Update an existing calendar event. Only provided fields are changed.",
        inputSchema: {
            account,
            calendarId: z.string().default("primary").optional(),
            eventId: z.string(),
            summary: z.string().optional(),
            description: z.string().optional(),
            location: z.string().optional(),
            start: z.string().optional().describe("New start time (RFC3339) or date."),
            end: z.string().optional().describe("New end time (RFC3339) or date."),
            attendees: z.array(z.string()).optional(),
            sendUpdates: z.enum(["all", "externalOnly", "none"]).default("all").optional(),
            timeZone: z.string().optional(),
        },
    }, guard(async ({ account, calendarId, eventId, summary, description, location, start, end, attendees, sendUpdates, timeZone }) => {
        const g = clients.resolve(account);
        const cal = calendarId ?? "primary";
        const existing = await g.calendar.events.get({ calendarId: cal, eventId });
        const ev = existing.data;
        if (start !== undefined) {
            const isDateTime = start.includes("T");
            ev.start = isDateTime ? { dateTime: start, timeZone } : { date: start, timeZone };
        }
        if (end !== undefined) {
            const isDateTime = end.includes("T");
            ev.end = isDateTime ? { dateTime: end, timeZone } : { date: end, timeZone };
        }
        if (summary !== undefined)
            ev.summary = summary;
        if (description !== undefined)
            ev.description = description;
        if (location !== undefined)
            ev.location = location;
        if (attendees !== undefined)
            ev.attendees = attendees.map((email) => ({ email }));
        const res = await g.calendar.events.update({
            calendarId: cal,
            eventId,
            sendUpdates: sendUpdates ?? "all",
            requestBody: ev,
        });
        return ok({
            summary: `✏️ Updated "${res.data.summary}"`,
            id: res.data.id,
            htmlLink: res.data.htmlLink,
            start: res.data.start,
            end: res.data.end,
        });
    }));
    server.registerTool("calendar_event_delete", {
        title: "Delete event",
        description: "Delete a calendar event.",
        inputSchema: {
            account,
            calendarId: z.string().default("primary").optional(),
            eventId: z.string(),
            sendUpdates: z.enum(["all", "externalOnly", "none"]).default("all").optional(),
        },
    }, guard(async ({ account, calendarId, eventId, sendUpdates }) => {
        const g = clients.resolve(account);
        await g.calendar.events.delete({
            calendarId: calendarId ?? "primary",
            eventId,
            sendUpdates: sendUpdates ?? "all",
        });
        return ok({ summary: `🗑️ Deleted event ${eventId}` });
    }));
    server.registerTool("calendar_event_respond", {
        title: "Respond to event invite",
        description: "Accept, decline, or mark as tentative an event invitation.",
        inputSchema: {
            account,
            calendarId: z.string().default("primary").optional(),
            eventId: z.string(),
            response: z.enum(["accepted", "declined", "tentative"]),
            comment: z.string().optional(),
            sendUpdates: z.enum(["all", "externalOnly", "none"]).default("all").optional(),
        },
    }, guard(async ({ account, calendarId, eventId, response, comment, sendUpdates }) => {
        const g = clients.resolve(account);
        const cal = calendarId ?? "primary";
        const existing = await g.calendar.events.get({ calendarId: cal, eventId });
        const ev = existing.data;
        const meEmail = (await g.calendar.calendarList.get({ calendarId: cal })).data.id;
        const attendee = ev.attendees?.find((a) => a.self || a.email === meEmail);
        if (!attendee)
            return fail("You are not listed as an attendee of this event.");
        attendee.responseStatus = response;
        if (comment)
            attendee.comment = comment;
        const res = await g.calendar.events.patch({
            calendarId: cal,
            eventId,
            sendUpdates: sendUpdates ?? "all",
            requestBody: { attendees: ev.attendees },
        });
        return ok({
            summary: `✅ Responded "${response}" to "${res.data.summary}"`,
            responseStatus: response,
            eventId: res.data.id,
        });
    }));
    server.registerTool("calendar_freebusy", {
        title: "Check free/busy",
        description: "Query free/busy information for one or more calendars or email addresses.",
        inputSchema: {
            account,
            timeMin: z.string().describe("Start of range (RFC3339)."),
            timeMax: z.string().describe("End of range (RFC3339)."),
            items: z
                .array(z.string())
                .describe("Calendar IDs or email addresses to check. Use 'primary' for your own calendar."),
        },
    }, guard(async ({ account, timeMin, timeMax, items }) => {
        const g = clients.resolve(account);
        const res = await g.calendar.freebusy.query({
            requestBody: {
                timeMin,
                timeMax,
                items: items.map((id) => ({ id })),
            },
        });
        return ok({
            summary: `📊 Free/busy for ${items.length} calendar(s)`,
            timeMin: res.data.timeMin,
            timeMax: res.data.timeMax,
            calendars: res.data.calendars,
        });
    }));
}
