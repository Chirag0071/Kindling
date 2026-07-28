"use client";

import { useState, useRef, useCallback, useEffect, MutableRefObject } from "react";

// Google's free public STUN servers - no signup, no cost. Handles NAT
// traversal for most real-world connections (typical home/office wifi).
// Doesn't cover every network (some restrictive corporate/carrier NATs need
// a TURN relay, which is a paid service or self-hosted) - see README.
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export type CallState = "idle" | "outgoing" | "incoming" | "active";

interface SignalMessage {
  type: string;
  from_user_id?: string;
  payload?: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit; duration_seconds?: number };
}

export function useWebRTCCall(wsRef: MutableRefObject<WebSocket | null>) {
  const [callState, setCallState] = useState<CallState>("idle");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const callStartRef = useRef<number | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSetRef = useRef(false);
  const incomingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const send = useCallback((payload: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, [wsRef]);

  const startDurationTimer = useCallback(() => {
    callStartRef.current = Date.now();
    durationIntervalRef.current = setInterval(() => {
      setCallDuration(Math.floor((Date.now() - (callStartRef.current || Date.now())) / 1000));
    }, 1000);
  }, []);

  const cleanupMedia = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    pcRef.current?.close();
    pcRef.current = null;
    remoteDescSetRef.current = false;
    pendingIceRef.current = [];
    incomingOfferRef.current = null;
    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    callStartRef.current = null;
    setCallDuration(0);
    setIsMuted(false);
    setIsCameraOff(false);
  }, []);

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        send({ type: "call-ice-candidate", payload: { candidate: event.candidate.toJSON() } });
      }
    };
    pc.ontrack = (event) => setRemoteStream(event.streams[0]);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") {
        setError("Couldn't connect - this can happen on some networks without a relay server.");
      }
    };
    pcRef.current = pc;
    return pc;
  }, [send]);

  const getLocalMedia = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  const startCall = useCallback(async () => {
    setError(null);
    try {
      const stream = await getLocalMedia();
      const pc = createPeerConnection();
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send({ type: "call-offer", payload: { sdp: offer } });
      setCallState("outgoing");
    } catch {
      setError("Couldn't access camera or microphone.");
      cleanupMedia();
    }
  }, [getLocalMedia, createPeerConnection, send, cleanupMedia]);

  const acceptCall = useCallback(async () => {
    setError(null);
    try {
      const stream = await getLocalMedia();
      const pc = createPeerConnection();
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      if (incomingOfferRef.current) {
        await pc.setRemoteDescription(new RTCSessionDescription(incomingOfferRef.current));
        remoteDescSetRef.current = true;
        for (const candidate of pendingIceRef.current) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
        pendingIceRef.current = [];
      }
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send({ type: "call-answer", payload: { sdp: answer } });

      startDurationTimer();
      setCallState("active");
    } catch {
      setError("Couldn't access camera or microphone.");
      cleanupMedia();
      setCallState("idle");
    }
  }, [getLocalMedia, createPeerConnection, send, cleanupMedia, startDurationTimer]);

  const declineCall = useCallback(() => {
    send({ type: "call-decline" });
    cleanupMedia();
    setCallState("idle");
  }, [send, cleanupMedia]);

  const endCall = useCallback(() => {
    const duration = callStartRef.current ? Math.floor((Date.now() - callStartRef.current) / 1000) : 0;
    send({ type: "call-end", payload: { duration_seconds: duration } });
    cleanupMedia();
    setCallState("idle");
  }, [send, cleanupMedia]);

  const toggleMute = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsMuted(!track.enabled);
    }
  }, []);

  const toggleCamera = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsCameraOff(!track.enabled);
    }
  }, []);

  // Fed by the chat page's ws.onmessage for any call-* message type - the
  // hook doesn't own the WebSocket connection, it shares the chat page's one.
  const handleSignal = useCallback(async (data: SignalMessage) => {
    switch (data.type) {
      case "call-offer": {
        if (data.payload?.sdp) incomingOfferRef.current = data.payload.sdp;
        setCallState("incoming");
        break;
      }
      case "call-answer": {
        if (pcRef.current && data.payload?.sdp) {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.payload.sdp));
          remoteDescSetRef.current = true;
          for (const candidate of pendingIceRef.current) {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          }
          pendingIceRef.current = [];
          startDurationTimer();
          setCallState("active");
        }
        break;
      }
      case "call-ice-candidate": {
        const candidate = data.payload?.candidate;
        if (!candidate) break;
        if (pcRef.current && remoteDescSetRef.current) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          pendingIceRef.current.push(candidate);
        }
        break;
      }
      case "call-decline": {
        setError("Call declined.");
        cleanupMedia();
        setCallState("idle");
        break;
      }
      case "call-peer-disconnected":
      case "call-end": {
        cleanupMedia();
        setCallState("idle");
        break;
      }
    }
  }, [cleanupMedia, startDurationTimer]);

  useEffect(() => cleanupMedia, [cleanupMedia]);

  return {
    callState, localStream, remoteStream, isMuted, isCameraOff, callDuration, error,
    startCall, acceptCall, declineCall, endCall, toggleMute, toggleCamera, handleSignal,
    clearError: () => setError(null),
  };
}
