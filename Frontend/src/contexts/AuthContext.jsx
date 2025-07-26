import axios from "axios";
import httpStatus from "http-status";
import { createContext, useState } from "react";
import { useNavigate } from "react-router-dom";

export const AuthContext = createContext({});

const server = "http://localhost:8000"; // Replace with your actual backend URL

const client = axios.create({
  baseURL: `${server}/api/v1/users`
});

export const AuthProvider = ({ children }) => {
  const [userData, setUserData] = useState({});
  const router = useNavigate();

  const handleRegister = async (name, username, password) => {
    try {
      const request = await client.post("/register", {
        name,
        username,
        password
      });
      if (request.status === httpStatus.CREATED) {
        return request.data.message; // fixed typo from 'messgae'
      }
    } catch (err) {
      throw err;
    }
  };

  const handleLogin = async (username, password) => {
    try {
      const request = await client.post("/login", {
        username,
        password
      });
      if (request.status === httpStatus.OK) {
        localStorage.setItem("token", request.data.token);
        router("/home");
      }
    } catch (err) {
      throw err;
    }
  };

  const data = {
    userData,
    setUserData,
    handleRegister,
    handleLogin
  };

  return <AuthContext.Provider value={data}>{children}</AuthContext.Provider>;
};
