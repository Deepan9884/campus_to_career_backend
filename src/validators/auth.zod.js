const { z } = require("zod");

const registerSchema = z.object({
  body: z.object({
    name: z.string().min(2, "Name must be at least 2 characters").max(50, "Name must be at most 50 characters").trim(),
    email: z.string().email("A valid email address is required").trim().toLowerCase(),
    password: z.string().min(8, "Password must be at least 8 characters long")
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "Password must contain at least one lowercase letter, one uppercase letter, and one digit"),
  }),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email("A valid email address is required").trim().toLowerCase(),
    password: z.string().min(1, "Password is required"),
  }),
});

const updateProfileSchema = z.object({
  body: z.object({
    name: z.string().min(2, "Name must be at least 2 characters").max(50, "Name must be at most 50 characters").trim().optional(),
    targetRole: z.string().max(100, "Target role must be at most 100 characters").regex(/^[a-zA-Z0-9 \-\/&(),\.]*$/, "Target role contains invalid characters").trim().optional().or(z.literal("")),
    bio: z.string().max(500, "Bio must be at most 500 characters").trim().optional().or(z.literal("")),
    location: z.string().max(100, "Location must be at most 100 characters").trim().optional().or(z.literal("")),
    linkedinUrl: z.string().url("LinkedIn URL must be a valid URL").trim().optional().or(z.literal("")),
    avatar: z.string().max(500000, "Avatar payload exceeds maximum allowed size (500KB)")
      .refine(val => val.startsWith("http://") || val.startsWith("https://") || val.startsWith("data:image/"), {
        message: "Avatar must be a valid URL or base64 data URI",
      }).optional().or(z.literal("")),
    githubUsername: z.string().max(39, "GitHub username must be at most 39 characters").regex(/^[a-zA-Z0-9-]*$/, "GitHub username can only contain letters, numbers, and hyphens").trim().optional().or(z.literal("")),
    profile: z.object({
      targetRole: z.string().optional().or(z.literal("")),
      githubUsername: z.string().optional().or(z.literal("")),
      bio: z.string().optional().or(z.literal("")),
      location: z.string().optional().or(z.literal("")),
    }).optional(),
    preferences: z.object({
      theme: z.enum(["dark", "light", "system"]).optional(),
      accentColor: z.enum(["indigo", "purple", "emerald", "amber", "cyan", "rose"]).optional(),
      notifyOn: z.array(z.string()).optional(),
      emailDigest: z.enum(["off", "daily", "weekly"]).optional(),
      aiDifficulty: z.enum(["Beginner", "Intermediate", "Advanced"]).optional(),
      preferredLanguage: z.string().optional(),
      resumePrivacy: z.boolean().optional(),
      dailyGoalProblems: z.number().optional(),
      hiddenModules: z.array(z.string()).optional(),
    }).optional(),
  }),
});

const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email("A valid email address is required").trim().toLowerCase(),
  }),
});

const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1, "Reset token is required").trim(),
    newPassword: z.string().min(8, "Password must be at least 8 characters long")
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "Password must contain at least one lowercase letter, one uppercase letter, and one digit"),
  }),
});

const updatePreferencesSchema = z.object({
  body: z.object({
    theme: z.enum(["dark", "light", "system"], {
      errorMap: () => ({ message: "Theme must be 'dark', 'light', or 'system'" })
    }).optional(),
    notifyOn: z.array(z.string()).optional(),
    emailDigest: z.enum(["off", "daily", "weekly"]).optional(),
    aiDifficulty: z.enum(["Beginner", "Intermediate", "Advanced"]).optional(),
    preferredLanguage: z.string().optional(),
    resumePrivacy: z.boolean().optional(),
    dailyGoalProblems: z.number().int().min(1).max(100).optional(),
    hiddenModules: z.array(z.string()).optional(),
  }),
});

module.exports = {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  updatePreferencesSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
};
