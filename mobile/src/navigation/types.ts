import type { NavigatorScreenParams } from "@react-navigation/native";

export type AuthStackParamList = {
  Onboarding: undefined;
  Welcome: undefined;
  Login: undefined;
  RegisterChoice: undefined;
  RegisterStaylite: undefined;
  RegisterFresher: undefined;
  VerifyEmail: { email: string };
};

/** Bottom nav — five tabs (spec §3): Home · Vault · Tools · Study · Settings. */
export type MainTabParamList = {
  Home: undefined;
  Vault: undefined;
  Tools: undefined;
  Study: undefined;
  Settings: undefined;
};

export type MainStackParamList = {
  CompleteProfile: undefined;
  Home: NavigatorScreenParams<MainTabParamList>;
  PayFee: { feeId: string };
  Receipt: { paymentId: string };
  Referrals: undefined;
  Profile: undefined;
  Explore: undefined;
  Events: undefined;
  Fees: undefined;
  VerificationUpload: undefined;
  VerificationStatus: undefined;
  OfflineModels: undefined;
  Notifications: undefined;
  Quiz: undefined;
  CgpaCalculator: undefined;
  Timetable: undefined;
  MyMaterials: undefined;
  FocusTimer: undefined;
  DeadlineTracker: undefined;
  VaultUpload: undefined;
  Ocr: undefined;
  ImageToPdf: undefined;
  FileCompressor: undefined;
  PdfMerge: undefined;
  PdfSplit: undefined;
  PdfToWord: undefined;
  WordToPdf: undefined;
  PassportRemover: undefined;
  Citation: undefined;
};
