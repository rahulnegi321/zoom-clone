import React, { useEffect, useRef, useState } from 'react';
import io from "socket.io-client";
import { Badge, IconButton, TextField, Button } from '@mui/material';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import CallEndIcon from '@mui/icons-material/CallEnd';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import ScreenShareIcon from '@mui/icons-material/ScreenShare';
import StopScreenShareIcon from '@mui/icons-material/StopScreenShare';
import ChatIcon from '@mui/icons-material/Chat';
import styles from "../styles/videoComponent.module.css";

// Socket server URL
const server_url = "http://localhost:8000";

// Object to hold all peer connections
let connections = {};

// STUN server for WebRTC connection
const peerConfigConnections = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

export default function VideoMeetComponent() {
  // Refs for socket and local video
  const socketRef = useRef();
  const socketIdRef = useRef();
  const localVideoref = useRef();
  const videoRef = useRef([]); // Ref to hold multiple remote videos

  // State variables
  const [videoAvailable, setVideoAvailable] = useState(true);
  const [audioAvailable, setAudioAvailable] = useState(true);
  const [video, setVideo] = useState(true);
  const [audio, setAudio] = useState(true);
  const [screen, setScreen] = useState(false);
  const [showModal, setModal] = useState(true);
  const [screenAvailable, setScreenAvailable] = useState(false);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [newMessages, setNewMessages] = useState(0);
  const [askForUsername, setAskForUsername] = useState(true);
  const [username, setUsername] = useState("");
  const [videos, setVideos] = useState([]);
  const [localStream, setLocalStream] = useState(null);

  // Trigger screen sharing when screen state changes
  useEffect(() => {
    if (screen !== undefined) handleScreenShare();
  }, [screen]);

  // Get camera and mic permissions
  const getPermissions = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      setVideoAvailable(true);
      setAudioAvailable(true);

      // Check if screen sharing is available
      if (navigator.mediaDevices.getDisplayMedia) setScreenAvailable(true);
    } catch (err) {
      console.error("Media permission error:", err);
      setVideoAvailable(false);
      setAudioAvailable(false);
    }
  };

  // Set local stream to video element
  useEffect(() => {
    if (localStream && localVideoref.current) {
      localVideoref.current.srcObject = localStream;
    }
  }, [localStream]);

  // Called when user clicks Connect after entering username
  const connect = async () => {
    setAskForUsername(false);
    await getPermissions(); // Ask for camera/mic access
  };

  // Once local stream is ready and user has joined, connect to signaling server
  useEffect(() => {
    if (localStream && !askForUsername) {
      connectToSocketServer();
    }
  }, [localStream]);

  // Connect to signaling server using Socket.IO
  const connectToSocketServer = () => {
    socketRef.current = io.connect(server_url, { secure: false });

    socketRef.current.on('signal', gotMessageFromServer);

    socketRef.current.on('connect', () => {
      socketRef.current.emit('join-call', window.location.href);
      socketIdRef.current = socketRef.current.id;

      socketRef.current.on('chat-message', addMessage);

      socketRef.current.on('user-left', id => {
        // Remove user's video when they leave
        setVideos(videos => videos.filter(video => video.socketId !== id));
      });

      socketRef.current.on('user-joined', (id, clients) => {
        // Loop through all connected users
        clients.forEach(socketListId => {
          if (connections[socketListId]) return;

          // Create WebRTC peer connection
          const pc = new RTCPeerConnection(peerConfigConnections);
          connections[socketListId] = pc;

          // Handle ICE candidates
          pc.onicecandidate = e => {
            if (e.candidate) {
              socketRef.current.emit('signal', socketListId, JSON.stringify({ ice: e.candidate }));
            }
          };

          // Handle remote stream added
          pc.onaddstream = event => {
            const exists = videoRef.current.find(v => v.socketId === socketListId);
            if (!exists) {
              const newVideo = { socketId: socketListId, stream: event.stream };
              setVideos(prev => {
                const updated = [...prev, newVideo];
                videoRef.current = updated;
                return updated;
              });
            }
          };

          // Add local media stream to the peer connection
          if (localStream) pc.addStream(localStream);
        });

        // Create offer to initiate connection
        if (id === socketIdRef.current) {
          for (let id2 in connections) {
            if (id2 === socketIdRef.current) continue;

            connections[id2].createOffer().then(description => {
              connections[id2].setLocalDescription(description).then(() => {
                socketRef.current.emit('signal', id2, JSON.stringify({ sdp: connections[id2].localDescription }));
              });
            });
          }
        }
      });
    });
  };

  // Handle incoming signal (ICE candidate or SDP)
  const gotMessageFromServer = (fromId, message) => {
    const signal = JSON.parse(message);
    if (fromId !== socketIdRef.current) {
      const conn = connections[fromId];
      if (signal.sdp) {
        conn.setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(() => {
          if (signal.sdp.type === 'offer') {
            conn.createAnswer().then(description => {
              conn.setLocalDescription(description).then(() => {
                socketRef.current.emit('signal', fromId, JSON.stringify({ sdp: conn.localDescription }));
              });
            });
          }
        });
      }
      if (signal.ice) {
        conn.addIceCandidate(new RTCIceCandidate(signal.ice)).catch(console.log);
      }
    }
  };

  // Toggle local video on/off
  const handleVideo = () => {
    setVideo(prev => !prev);
    if (localStream) localStream.getVideoTracks()[0].enabled = !video;
  };

  // Toggle local audio on/off
  const handleAudio = () => {
    setAudio(prev => !prev);
    if (localStream) localStream.getAudioTracks()[0].enabled = !audio;
  };

  // Start or stop screen sharing
  const handleScreenShare = async () => {
    if (screen) {
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = displayStream.getVideoTracks()[0];
        const sender = getVideoSender(); // Get video sender from peer connection
        sender.replaceTrack(screenTrack);

        // When user stops screen sharing
        screenTrack.onended = () => {
          sender.replaceTrack(localStream.getVideoTracks()[0]);
          setScreen(false);
        };
      } catch (e) {
        console.error("Screen share error:", e);
        setScreen(false);
      }
    }
  };

  // Get the video track sender from first connection
  const getVideoSender = () => {
    const pc = Object.values(connections)[0];
    return pc.getSenders().find(s => s.track.kind === "video");
  };

  // End the call and clean up media streams
  const handleEndCall = () => {
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    window.location.href = "/";
  };

  // Open chat modal
  const openChat = () => {
    setModal(true);
    setNewMessages(0);
  };

  // Add incoming chat message
  const addMessage = (data, sender, socketIdSender) => {
    setMessages(prev => [...prev, { sender, data }]);
    if (socketIdSender !== socketIdRef.current) setNewMessages(prev => prev + 1);
  };

  // Send chat message
  const sendMessage = () => {
    socketRef.current.emit('chat-message', message, username);
    setMessage("");
  };

  return (
    <div>
      {askForUsername ? (
        // Initial Lobby Screen
        <div>
          <h2>Enter into Lobby</h2>
          <TextField label="Username" value={username} onChange={e => setUsername(e.target.value)} />
          <Button variant="contained" onClick={connect}>Connect</Button>
        </div>
      ) : (
        // Main Video Call UI
        <div className={styles.meetVideoContainer}>
          {showModal && (
            <div className={styles.chatRoom}>
              <div className={styles.chatContainer}>
                <h1>Chat</h1>
                <div className={styles.chattingDisplay}>
                  {messages.length ? messages.map((item, index) => (
                    <div key={index} style={{ marginBottom: "20px" }}>
                      <p style={{ fontWeight: "bold" }}>{item.sender}</p>
                      <p>{item.data}</p>
                    </div>
                  )) : <p>No Messages Yet</p>}
                </div>
                <div className={styles.chattingArea}>
                  <TextField value={message} onChange={e => setMessage(e.target.value)} label="Enter Your chat" />
                  <Button variant='contained' onClick={sendMessage}>Send</Button>
                </div>
              </div>
            </div>
          )}

          {/* Button Controls */}
          <div className={styles.buttonContainers}>
            <IconButton onClick={handleVideo} style={{ color: "white" }}>
              {video ? <VideocamIcon /> : <VideocamOffIcon />}
            </IconButton>
            <IconButton onClick={handleEndCall} style={{ color: "red" }}>
              <CallEndIcon />
            </IconButton>
            <IconButton onClick={handleAudio} style={{ color: "white" }}>
              {audio ? <MicIcon /> : <MicOffIcon />}
            </IconButton>
            {screenAvailable && (
              <IconButton onClick={() => setScreen(!screen)} style={{ color: "white" }}>
                {screen ? <ScreenShareIcon /> : <StopScreenShareIcon />}
              </IconButton>
            )}
            <Badge badgeContent={newMessages} color='orange'>
              <IconButton onClick={() => setModal(!showModal)} style={{ color: "white" }}>
                <ChatIcon />
              </IconButton>
            </Badge>
          </div>

          {/* Local Video */}
          <video className={styles.meetUserVideo} ref={localVideoref} autoPlay muted playsInline></video>

          {/* Remote Videos */}
          <div className={styles.conferenceView}>
            {videos.map(video => (
              <div key={video.socketId}>
                <video
                  data-socket={video.socketId}
                  ref={ref => ref && (ref.srcObject = video.stream)}
                  autoPlay
                  playsInline
                ></video>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
