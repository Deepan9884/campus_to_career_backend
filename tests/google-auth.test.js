const jwt = require("jsonwebtoken");

// Mock dependencies before importing controller
jest.mock("../src/services/email.service", () => ({
  sendWelcomeEmail: jest.fn().mockResolvedValue(true),
  sendNewLoginAlertEmail: jest.fn().mockResolvedValue(true),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
}));

jest.mock("../src/models/User.model", () => {
  const mockUserInstance = (data) => ({
    ...data,
    save: jest.fn().mockResolvedValue(data),
    generateAccessToken: jest.fn().mockReturnValue("mock-access-token-jwt"),
    generateRefreshToken: jest.fn().mockReturnValue("mock-refresh-token-jwt"),
  });

  return {
    findOne: jest.fn(),
    create: jest.fn((data) => Promise.resolve(mockUserInstance(data))),
    findById: jest.fn(),
    mockUserInstance,
  };
});

const User = require("../src/models/User.model");
const authController = require("../src/controllers/auth.controller");

function runController(controller, body = {}, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = {
      body,
      headers,
      ip: "127.0.0.1",
      socket: { remoteAddress: "127.0.0.1" },
    };

    const res = {
      statusCode: 200,
      cookies: {},
      cookie(name, value, options) {
        this.cookies[name] = { value, options };
        return this;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        resolve({ statusCode: this.statusCode, cookies: this.cookies, body: data });
        return this;
      },
    };

    const next = (err) => {
      if (err) reject(err);
      else resolve({ statusCode: res.statusCode, cookies: res.cookies, body: null });
    };

    controller(req, res, next);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Google Authentication Controller", () => {
  test("fails if credential is not provided in request body", async () => {
    let error;
    try {
      await runController(authController.googleLogin, {});
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.statusCode).toBe(400);
    expect(error.message).toContain("Google credential is required");
  });

  test("fails if Google token verification fails", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: jest.fn().mockResolvedValue({ error: "invalid_token" }),
    });

    let error;
    try {
      await runController(authController.googleLogin, { credential: "invalid-token-12345" });
    } catch (err) {
      error = err;
    } finally {
      global.fetch = originalFetch;
    }

    expect(error).toBeDefined();
    expect(error.statusCode).toBe(401);
    expect(error.message).toContain("Google authentication token verification failed");
  });

  test("creates a new student user and returns access token when Google userinfo succeeds", async () => {
    const mockGoogleProfile = {
      sub: "google-uid-1001",
      email: "newstudent@gmail.com",
      name: "New Student",
      picture: "https://lh3.googleusercontent.com/avatar1001.png",
      email_verified: true,
    };

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockGoogleProfile),
    });

    User.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(null),
    });

    const result = await runController(authController.googleLogin, {
      credential: "valid-oauth-access-token-1001",
    });

    global.fetch = originalFetch;

    expect(result.statusCode).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.data.user.email).toBe("newstudent@gmail.com");
    expect(result.body.data.user.name).toBe("New Student");
    expect(result.body.data.user.authProvider).toBe("google");
    expect(result.body.data.user.role).toBe("student");
    expect(result.body.data.user.isEmailVerified).toBe(true);
    expect(result.body.data.accessToken).toBe("mock-access-token-jwt");
    expect(result.cookies.refreshToken).toBeDefined();

    expect(User.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "newstudent@gmail.com",
        googleId: "google-uid-1001",
        authProvider: "google",
        isEmailVerified: true,
      })
    );
  });

  test("auto-links existing local account and preserves existing mentor role", async () => {
    const existingUserDoc = User.mockUserInstance({
      _id: "65a000000000000000000001",
      name: "Dr. Mentor",
      email: "mentor@college.edu",
      authProvider: "local",
      role: "mentor",
      isEmailVerified: false,
      avatar: "",
    });

    User.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(existingUserDoc),
    });

    const mockGoogleProfile = {
      sub: "google-uid-mentor-555",
      email: "mentor@college.edu",
      name: "Dr. Mentor",
      picture: "https://lh3.googleusercontent.com/mentor-pic.jpg",
      email_verified: true,
    };

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockGoogleProfile),
    });

    const result = await runController(authController.googleLogin, {
      credential: "valid-oauth-access-token-mentor",
    });

    global.fetch = originalFetch;

    expect(result.statusCode).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.data.user.email).toBe("mentor@college.edu");
    expect(result.body.data.user.role).toBe("mentor");
    expect(result.body.data.user.authProvider).toBe("both");
    expect(existingUserDoc.googleId).toBe("google-uid-mentor-555");
    expect(existingUserDoc.authProvider).toBe("both");
    expect(existingUserDoc.avatar).toBe("https://lh3.googleusercontent.com/mentor-pic.jpg");
    expect(existingUserDoc.isEmailVerified).toBe(true);
    expect(existingUserDoc.save).toHaveBeenCalled();
  });

  test("rejects Google account if email is unverified", async () => {
    const mockUnverifiedGoogleProfile = {
      sub: "google-uid-unverified",
      email: "unverified@gmail.com",
      name: "Unverified User",
      email_verified: false,
    };

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockUnverifiedGoogleProfile),
    });

    let error;
    try {
      await runController(authController.googleLogin, {
        credential: "access-token-unverified",
      });
    } catch (err) {
      error = err;
    } finally {
      global.fetch = originalFetch;
    }

    expect(error).toBeDefined();
    expect(error.statusCode).toBe(401);
    expect(error.message).toContain("Google authentication token verification failed");
  });
});
