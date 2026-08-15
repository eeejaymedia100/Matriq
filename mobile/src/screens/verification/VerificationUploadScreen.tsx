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
import { useTheme } from "../../theme/ThemeContext";
import { ThemedScreen } from "../../components/Surface";
import { Button, Card, Icon } from "../../components";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../api/client";
import * as ImagePicker from "expo-image-picker";
import type { MatriqTheme, MatriqThemeColors } from "../../theme/themes";

interface Props {
  navigation: { navigate: (s: string, p?: object) => void; goBack: () => void };
  route: { params?: { associationId?: string } };
}

export function VerificationUploadScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const styles = makeStyles(theme, colors);

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
    <ThemedScreen>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>Identity Verification</Text>
          <Text style={styles.subtitle}>
            Upload a photo of your student ID card or a screenshot of your
            university portal profile page. An association executive will
            review it to confirm your identity.
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
                    <Icon name="camera" size={36} color={colors.brand} />
                    <Text style={styles.pickerLabel}>Take Photo</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.pickerBtn} onPress={pickImage}>
                    <Icon name="image" size={36} color={colors.brand} />
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
            <Card title="No Association">
              <Text style={styles.warningText}>
                You need to join an association before uploading verification
                documents. Visit the Explore tab to browse available
                associations.
              </Text>
            </Card>
          )}

          <Text style={styles.privacy}>
            Your document is stored securely and visible only to your
            association's executives. See our Privacy Policy for details.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </ThemedScreen>
  );
}

function makeStyles(theme: MatriqTheme, colors: MatriqThemeColors) {
  return StyleSheet.create({
    container: { padding: theme.spacing.lg },
    title: {
      fontFamily: theme.typography.h2.fontFamily,
      fontSize: theme.typography.h2.fontSize,
      lineHeight: theme.typography.h2.lineHeight,
      color: colors.textPrimary,
      marginBottom: theme.spacing.xs,
    },
    subtitle: {
      fontFamily: theme.typography.body.fontFamily,
      fontSize: theme.typography.body.fontSize,
      lineHeight: theme.typography.body.lineHeight,
      color: colors.textSecondary,
      marginBottom: theme.spacing.lg,
    },
    pickerArea: { marginBottom: theme.spacing.md },
    pickerRow: {
      flexDirection: "row",
      gap: theme.spacing.md,
      marginBottom: theme.spacing.md,
    },
    pickerBtn: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: theme.radii.lg,
      borderWidth: 2,
      borderColor: colors.border,
      borderStyle: "dashed",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: theme.spacing.xl,
      gap: theme.spacing.sm,
    },
    pickerLabel: {
      fontFamily: theme.typography.captionBold.fontFamily,
      fontSize: theme.typography.captionBold.fontSize,
      color: colors.textSecondary,
    },
    hint: {
      fontFamily: theme.typography.small.fontFamily,
      fontSize: theme.typography.small.fontSize,
      color: colors.textMuted,
      textAlign: "center",
    },
    previewContainer: { alignItems: "center", marginBottom: theme.spacing.md },
    preview: {
      width: "100%",
      height: 250,
      borderRadius: theme.radii.lg,
      backgroundColor: colors.border,
      marginBottom: theme.spacing.sm,
    },
    fileName: {
      fontFamily: theme.typography.caption.fontFamily,
      fontSize: theme.typography.caption.fontSize,
      color: colors.textSecondary,
      marginBottom: theme.spacing.xs,
    },
    removeText: {
      fontFamily: theme.typography.captionBold.fontFamily,
      fontSize: theme.typography.captionBold.fontSize,
      color: colors.error,
    },
    warningText: {
      fontFamily: theme.typography.body.fontFamily,
      fontSize: theme.typography.body.fontSize,
      color: colors.textSecondary,
    },
    privacy: {
      fontFamily: theme.typography.small.fontFamily,
      fontSize: theme.typography.small.fontSize,
      color: colors.textMuted,
      textAlign: "center",
      marginTop: theme.spacing.lg,
      lineHeight: 18,
    },
  });
}
