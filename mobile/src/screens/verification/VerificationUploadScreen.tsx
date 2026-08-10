import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
  TouchableOpacity,
  Image,
} from "react-native";
import { colors, spacing, typography, radii } from "../../theme/colors";
import { Button, Card } from "../../components";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../api/client";
import * as ImagePicker from "expo-image-picker";

interface Props {
  navigation: { navigate: (s: string, p?: object) => void; goBack: () => void };
  route: { params?: { associationId?: string } };
}

export function VerificationUploadScreen({ navigation, route }: Props) {
  const { user, refreshUser, uploadVerification } = useAuth();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [associationId, setAssociationId] = useState(
    route.params?.associationId ?? "",
  );

  const associationIdFromRoute = route.params?.associationId;

  // If no associationId from route, fetch from memberships
  React.useEffect(() => {
    if (associationIdFromRoute) return;
    (async () => {
      try {
        const data = await api.get<{
          memberships: Array<{ association: { id: string } }>;
        }>("/me/memberships");
        if (data.memberships.length > 0) {
          setAssociationId(data.memberships[0].association.id);
        }
      } catch {
        // No membership yet
      }
    })();
  }, [associationIdFromRoute]);

  const pickImage = async () => {
    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission Needed",
        "Matriq needs access to your photos to upload a verification document.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);
      setSelectedFileName(result.assets[0].fileName ?? "photo.jpg");
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission Needed",
        "Matriq needs camera access to photograph your student ID.",
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);
      setSelectedFileName(result.assets[0].fileName ?? "camera-photo.jpg");
    }
  };

  const handleUpload = async () => {
    if (!selectedImage) {
      Alert.alert(
        "Select a document",
        "Please select or capture your student ID card or portal screenshot.",
      );
      return;
    }
    if (!associationId) {
      Alert.alert(
        "No Association",
        "Join an association first before uploading verification documents.",
      );
      return;
    }

    setUploading(true);
    try {
      await uploadVerification(associationId, selectedImage, selectedFileName);
      Alert.alert(
        "Document Uploaded",
        "Your verification document has been submitted. An association executive will review it shortly.",
        [
          {
            text: "View Status",
            onPress: () => navigation.navigate("VerificationStatus"),
          },
        ],
      );
      await refreshUser();
    } catch (err) {
      Alert.alert(
        "Upload Failed",
        err instanceof Error ? err.message : "Could not upload document. Please try again.",
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Identity Verification</Text>
        <Text style={styles.subtitle}>
          Upload a photo of your student ID card or a screenshot of your university
          portal profile page. An association executive will review it to confirm
          your identity.
        </Text>

        <Card title="Upload Document">
          {selectedImage ? (
            <View style={styles.previewContainer}>
              <Image
                source={{ uri: selectedImage }}
                style={styles.preview}
                resizeMode="contain"
              />
              <Text style={styles.fileName}>{selectedFileName}</Text>
              <TouchableOpacity
                onPress={() => {
                  setSelectedImage(null);
                  setSelectedFileName("");
                }}
              >
                <Text style={styles.removeText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.pickerArea}>
              <View style={styles.pickerRow}>
                <TouchableOpacity style={styles.pickerBtn} onPress={takePhoto}>
                  <Text style={styles.pickerIcon}>📷</Text>
                  <Text style={styles.pickerLabel}>Take Photo</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.pickerBtn} onPress={pickImage}>
                  <Text style={styles.pickerIcon}>🖼️</Text>
                  <Text style={styles.pickerLabel}>From Gallery</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.hint}>
                Accepted: JPG, PNG — student ID card or portal screenshot
              </Text>
            </View>
          )}

          <Button
            title={uploading ? "Uploading..." : "Submit for Review"}
            onPress={handleUpload}
            loading={uploading}
            disabled={!selectedImage || !associationId}
            size="lg"
          />
        </Card>

        {!associationId && (
          <Card title="⚠️ No Association">
            <Text style={styles.warningText}>
              You need to join an association before uploading verification
              documents. Visit the Explore tab to browse available associations.
            </Text>
          </Card>
        )}

        <Text style={styles.privacy}>
          Your document is stored securely and visible only to your association's
          executives. See our Privacy Policy for details.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg },
  title: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.xs },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  pickerArea: { marginBottom: spacing.md },
  pickerRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  pickerBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  pickerIcon: { fontSize: 36 },
  pickerLabel: { ...typography.captionBold, color: colors.textSecondary },
  hint: { ...typography.small, color: colors.textMuted, textAlign: "center" },
  previewContainer: { alignItems: "center", marginBottom: spacing.md },
  preview: {
    width: "100%",
    height: 250,
    borderRadius: radii.lg,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  fileName: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs },
  removeText: { ...typography.captionBold, color: colors.error },
  warningText: { ...typography.body, color: colors.textSecondary },
  privacy: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.lg,
    lineHeight: 18,
  },
});
