"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import DashboardLayout from "@/components/DashboardLayout";
import { useSession } from "@/components/SessionProvider";
import { getEvents, getCheckinToken, getEventAttendance } from "@/lib/api";

interface EventInfo {
  id: string;
  title: string;
  description: string;
  location: string;
  eventDate: string;
  attendanceCount: number;
}

export default function CheckinPage() {
  const { status, token, associationId } = useSession();
  const [events, setEvents] = useState<EventInfo[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [loading, setLoading] = useState(true);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [expiresIn, setExpiresIn] = useState(0);
  const [attendance, setAttendance] = useState<
    Array<{ id: string; checkedInAt: string; user: { fullName: string; department: string; level: string } }>
  >([]);
  const [attendanceTotal, setAttendanceTotal] = useState(0);
  const [error, setError] = useState("");
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadEvents = useCallback(async () => {
    if (!token || !associationId) return;
    try {
      const data = await getEvents(associationId, token);
      setEvents(data.events);
      if (data.events.length > 0 && !selectedEventId) {
        setSelectedEventId(data.events[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load events");
    } finally {
      setLoading(false);
    }
  }, [token, associationId, selectedEventId]);

  useEffect(() => {
    if (status !== "authenticated" || !token || !associationId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await getEvents(associationId, token);
        if (!cancelled) {
          setEvents(data.events);
          if (data.events.length > 0) setSelectedEventId(data.events[0].id);
        }
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

  const refreshToken = useCallback(async () => {
    if (!token || !selectedEventId) return;
    try {
      const data = await getCheckinToken(selectedEventId, token);
      const url = await QRCode.toDataURL(data.token, {
        width: 260,
        margin: 1,
        color: { dark: "#1a1033", light: "#ffffff" },
      });
      setQrDataUrl(url);
      setExpiresIn(data.expiresInSeconds);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate code");
    }
  }, [token, selectedEventId]);

  const loadAttendance = useCallback(async () => {
    if (!token || !selectedEventId) return;
    try {
      const data = await getEventAttendance(selectedEventId, token);
      setAttendance(data.attendance);
      setAttendanceTotal(data.total);
    } catch (err) {
      console.error(err);
    }
  }, [token, selectedEventId]);

  useEffect(() => {
    if (!selectedEventId) return;
    refreshToken();
    loadAttendance();

    // Rotate the code every 5 minutes (matches the backend window).
    if (refreshTimer.current) clearInterval(refreshTimer.current);
    refreshTimer.current = setInterval(() => {
      refreshToken();
      loadAttendance();
    }, 300_000);

    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [selectedEventId, refreshToken, loadAttendance]);

  useEffect(() => {
    // Countdown display
    if (expiresIn <= 0) return;
    const t = setInterval(() => {
      setExpiresIn((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [expiresIn > 0]);

  return (
    <DashboardLayout>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Event Check-in</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-6 text-sm">
          {error}
          <button onClick={() => setError("")} className="ml-2">
            ×
          </button>
        </div>
      )}

      {loading ? (
        <div className="h-40 bg-gray-100 rounded-xl animate-pulse" />
      ) : events.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500">No events yet</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-6">
            {events.map((ev) => (
              <button
                key={ev.id}
                onClick={() => setSelectedEventId(ev.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedEventId === ev.id
                    ? "bg-purple-700 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {ev.title}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* QR code */}
            <div className="bg-white rounded-xl border border-gray-200 p-8 flex flex-col items-center">
              <h2 className="font-semibold text-gray-900 mb-1">
                Scan-in QR code
              </h2>
              <p className="text-xs text-gray-400 mb-4">
                Students scan this with the Matriq app to check in. Rotates every 5 minutes.
              </p>
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- QR data URL can't use next/image
                <img
                  src={qrDataUrl}
                  alt="Check-in QR code"
                  className="w-64 h-64 rounded-xl border border-gray-200 p-2"
                />
              ) : (
                <div className="w-64 h-64 rounded-xl bg-gray-100 animate-pulse" />
              )}
              <p className="text-sm text-gray-500 mt-4">
                Code expires in{" "}
                <span className="font-semibold text-purple-700">
                  {Math.floor(expiresIn / 60)}:{String(expiresIn % 60).padStart(2, "0")}
                </span>
              </p>
              <button
                onClick={refreshToken}
                className="mt-4 px-4 py-2 bg-purple-700 text-white rounded-lg text-sm font-medium hover:bg-purple-800 transition-colors"
              >
                Refresh code
              </button>
            </div>

            {/* Attendance */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">
                  Checked in
                </h2>
                <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                  {attendanceTotal}
                </span>
              </div>
              {attendance.length === 0 ? (
                <p className="text-gray-500 text-sm">No one has checked in yet</p>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {attendance.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {a.user.fullName}
                        </p>
                        <p className="text-xs text-gray-400">
                          {a.user.department} · L{a.user.level}
                        </p>
                      </div>
                      <p className="text-xs text-gray-400">
                        {new Date(a.checkedInAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
