import { useState } from 'react';
import Landingpage from "./pages/landing";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Authentication from './pages/authentication';
import { AuthProvider } from './contexts/AuthContext';

import './App.css';
import VideoMeetComponent from './pages/videoMeet';
import HomeComponent from './pages/home';
import History from './pages/history';

function App() {
  return (
    <Router>

     <AuthProvider>
      <Routes>
        <Route path='/' element={<Landingpage />} />
        <Route path='/auth' element={<Authentication />} />
        <Route path='/home' element={<HomeComponent/>} />
        <Route path='/history' element={<History/>} />
        <Route path='/:url' element={<VideoMeetComponent/>} />
       </Routes>
      </AuthProvider>
      
    </Router>
  );
}

export default App;
