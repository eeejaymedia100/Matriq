"use client";

import { useCallback, useEffect, useState, FormEvent } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useSession } from "@/components/SessionProvider";
import { getEvents, createEvent } from "@/lib/api";

interface EventInfo {
  id: string;
  title: string;
  description: string;
  location: string;
  eventDate: string;
  rsvpCount: number;
  attendanceCount: number;
}

/**
 * Events (spec §2): associations post events that students RSVP to in the
 * app — the same feed the QR check-in draws from.
 */
export default function EventsPage() {
  const { status, token, associationId } = useSession();
  const [events, setEvents] = useState<EventInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!token || !associationId) return;
    try {
      const data = await getEvents(associationId, token);
      setEvents(data.events);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [token, associationId]);

  useEffect(() => {
    if (status !== "authenticated" || !token || !associationId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await getEvents(associationId, token);
        if (!cancelled) setEvents(data.events);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, token, associationId]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!token || !associationId) return;
    setSubmitting(true);
    try {
      await createEvent(
        associationId,
        {
          title,
          description,
          location,
          eventDate: new Date(eventDate).toISOString(),
        },
        token,
      );
      setMessage("Event created! Students can RSVP in the app.");
      setShowForm(false);
      setTitle("");
      setDescription("");
      setLocation("");
      setEventDate("");
      void load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to create event");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Events</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-purple-700 text-white rounded-lg text-sm font-medium hover:bg-purple-800 transition-colors"
        >
          {showForm ? "Cancel" : "New Event"}
        </button>
      </div>

      {message && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 mb-6 text-sm">
          {message}
          <button onClick={() => setMessage("")} className="ml-2">×</button>
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-white rounded-xl border border-gray-200 p-6 mb-6 space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                placeholder="e.g. Freshers' Orientation Night"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                placeholder="What students should know…"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Location
              </label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                placeholder="Lecture Hall B"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date & time
              </label>
              <input
                type="datetime-local"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2 bg-purple-700 text-white rounded-lg text-sm font-medium hover:bg-purple-800 disabled:bg-purple-400 transition-colors"
          >
            {submitting ? "Creating…" : "Create Event"}
          </button>
        </form>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500">No events yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {events.map((ev) => (
            <div
              key={ev.id}
              className="bg-white rounded-xl border border-gray-200 p-5"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-900">{ev.title}</h3>
                <div className="flex gap-3 text-xs text-gray-500">
                  <span className="inline-flex px-2 py-1 rounded-full bg-purple-100 text-purple-700 font-medium">
                    {ev.rsvpCount} RSVPs
                  </span>
                  <span className="inline-flex px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium">
                    {ev.attendanceCount} checked in
                  </span>
                </div>
              </div>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">
                {ev.description}
              </p>
              <p className="text-xs text-gray-400 mt-3">
                📍 {ev.location} ·{" "}
                {new Date(ev.eventDate).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
