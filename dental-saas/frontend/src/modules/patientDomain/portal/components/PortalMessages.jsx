/**
 * PortalMessages.jsx — Patient-Clinic Messaging UI
 *
 * Send messages to the clinic, view conversation history.
 * Uses portalMessagesApi.list() + portalMessagesApi.send().
 *
 * Plane isolation: no modules/org/* imports.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { portalMessagesApi } from "../services/portalMessages.api";
import { Send, MessageCircle, Loader } from "lucide-react";

export default function PortalMessages() {
    const [messages, setMessages]  = useState([]);
    const [content,  setContent]   = useState("");
    const [loading,  setLoading]   = useState(true);
    const [sending,  setSending]   = useState(false);
    const [error,    setError]     = useState(null);
    const bottomRef = useRef(null);

    const loadMessages = useCallback(() => {
        portalMessagesApi.list({ limit: 50 })
            .then((res) => {
                const msgs = res?.messages || res?.data || res || [];
                setMessages(Array.isArray(msgs) ? msgs : []);
            })
            .catch(() => setMessages([]))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        loadMessages();
        // Auto-poll every 30s
        const interval = setInterval(loadMessages, 30000);
        return () => clearInterval(interval);
    }, [loadMessages]);

    // Scroll to bottom on new messages
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSend = async (e) => {
        e.preventDefault();
        if (!content.trim() || sending) return;
        setSending(true); setError(null);
        try {
            await portalMessagesApi.send({ content: content.trim() });
            setContent("");
            loadMessages();
        } catch (err) {
            setError(err?.message || "Failed to send message");
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="space-y-8 pb-10">
            <section className="space-y-1">
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Messages</h2>
                <p className="text-slate-500 font-medium">Communicate directly with your care team</p>
            </section>

            <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden flex flex-col h-[65vh]">
                {/* Messages area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {loading ? (
                        <div className="flex justify-center pt-10">
                            <Loader className="w-6 h-6 text-blue-400 animate-spin" />
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                            <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mb-4">
                                <MessageCircle className="w-6 h-6 text-slate-300" />
                            </div>
                            <p className="font-bold text-slate-400">No messages yet</p>
                            <p className="text-sm text-slate-300 mt-1">Start the conversation with your care team below</p>
                        </div>
                    ) : (
                        messages.map((msg, idx) => {
                            const isPatient = msg.senderType === "patient" || msg.fromPatient;
                            const time = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" }) : "";
                            const date = msg.createdAt ? new Date(msg.createdAt).toLocaleDateString("en", { day: "numeric", month: "short" }) : "";

                            return (
                                <div key={msg._id || idx} className={`flex ${isPatient ? "justify-end" : "justify-start"}`}>
                                    <div className={`max-w-[75%] space-y-1 ${isPatient ? "items-end" : "items-start"} flex flex-col`}>
                                        {!isPatient && (
                                            <p className="text-[10px] font-bold text-slate-400 ml-1">
                                                {msg.senderName || "Care Team"}
                                            </p>
                                        )}
                                        <div className={`px-5 py-3 rounded-[18px] text-sm font-medium ${
                                            isPatient
                                                ? "bg-blue-600 text-white rounded-br-md shadow-lg shadow-blue-100"
                                                : "bg-slate-50 border border-slate-100 text-slate-700 rounded-bl-md"
                                        }`}>
                                            {msg.content}
                                        </div>
                                        <p className="text-[10px] text-slate-300 px-1">
                                            {date} · {time}
                                        </p>
                                    </div>
                                </div>
                            );
                        })
                    )}
                    <div ref={bottomRef} />
                </div>

                {/* Compose area */}
                <div className="border-t border-slate-100 p-4">
                    {error && (
                        <p className="text-xs text-red-500 mb-2 px-1">{error}</p>
                    )}
                    <form onSubmit={handleSend} className="flex gap-3 items-end">
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(e); }
                            }}
                            placeholder="Type your message... (Enter to send)"
                            rows={2}
                            disabled={sending}
                            className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-800 placeholder:text-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition disabled:opacity-60"
                        />
                        <button type="submit" disabled={sending || !content.trim()}
                            className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 shadow-lg shadow-blue-200 transition flex-shrink-0 disabled:opacity-40 disabled:shadow-none">
                            {sending
                                ? <Loader className="w-4 h-4 animate-spin" />
                                : <Send className="w-4 h-4" />}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
