import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeContext";
import { api } from "../api/client";
import { Icon } from "./icons";

interface Institution {
  id: string;
  name: string;
  shortName: string | null;
}

interface Faculty {
  id: string;
  name: string;
}

interface Department {
  id: string;
  name: string;
}

interface CascadeData {
  institutions: Array<Institution & { faculties: Array<Faculty & { departments: Department[] }> }>;
}

interface InstitutionCascadePickerProps {
  /** Currently selected institution id ("" = none). */
  institutionId: string;
  /** Currently selected faculty name. */
  faculty: string;
  /** Currently selected department name. */
  department: string;
  /** Called whenever the selection changes (id or names). */
  onChange: (institutionId: string, faculty: string, department: string) => void;
  /** Small caption under the picker. */
  hint?: string;
}

type PickerTarget = "institution" | "faculty" | "department";

/**
 * Cascading Institution → Faculty → Department picker used during
 * registration. Selecting an institution only ever shows its own faculties
 * and the selected faculty's own departments (no cross-institution leakage).
 *
 * If the school isn't listed, the user can keep typing faculty/department
 * free-text via the "Not listed" option (falls back to the legacy flow).
 */
export function InstitutionCascadePicker({
  institutionId,
  faculty,
  department,
  onChange,
  hint,
}: InstitutionCascadePickerProps) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const insets = useSafeAreaInsets();

  const [data, setData] = useState<CascadeData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<PickerTarget | null>(null);
  const [customInput, setCustomInput] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    api
      .get<CascadeData>("/institutions/cascade")
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setLoadError(true);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedInstitution = useMemo(
    () => data?.institutions.find((i) => i.id === institutionId) ?? null,
    [data, institutionId],
  );
  const selectedFaculty = useMemo(
    () => selectedInstitution?.faculties.find((f) => f.name === faculty) ?? null,
    [selectedInstitution, faculty],
  );
  const availableFaculties = selectedInstitution?.faculties ?? [];
  const availableDepartments = selectedFaculty?.departments ?? [];

  const labels: Record<PickerTarget, string> = {
    institution: "Institution",
    faculty: "Faculty",
    department: "Department",
  };

  const currentValue = (t: PickerTarget): string => {
    if (t === "institution") return institutionId ? selectedInstitution?.name ?? "" : "";
    if (t === "faculty") return faculty;
    return department;
  };

  const isPlaceholder = (t: PickerTarget): boolean => {
    if (t === "institution") return !institutionId;
    if (t === "faculty") return !faculty;
    return !department;
  };

  const open = (t: PickerTarget) => {
    setTarget(t);
    setCustomInput("");
  };

  const close = () => setTarget(null);

  const select = (t: PickerTarget, value: string) => {
    if (t === "institution") {
      const inst = data?.institutions.find((i) => i.name === value);
      onChange(inst ? inst.id : "", "", "");
    } else if (t === "faculty") {
      onChange(institutionId, value, "");
    } else {
      onChange(institutionId, faculty, value);
    }
    close();
  };

  // Free-text fallback (school not listed) — mirrors the legacy input flow.
  const submitCustom = (t: PickerTarget) => {
    const value = customInput.trim();
    if (!value) return;
    select(t, value);
  };

  const sheet = (
    <View
      style={{
        flex: 1,
        justifyContent: "flex-end",
      }}
    >
      <Pressable
        style={{
          position: Platform.OS === "web" ? ("fixed" as never) : ("absolute" as never),
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: colors.overlay,
        }}
        onPress={close}
      />
      <View
        style={{
          backgroundColor: theme.mode === "glass" ? "rgba(30,12,48,0.96)" : colors.surface,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          padding: 24,
          paddingBottom: Math.max(insets.bottom, 24),
          borderWidth: theme.mode === "glass" ? 1 : 0,
          borderColor: colors.border,
          maxHeight: "70%",
        }}
      >
        <View
          style={{
            alignSelf: "center",
            width: 40,
            height: 4,
            borderRadius: 2,
            backgroundColor: colors.border,
            marginBottom: 16,
          }}
        />
        <Text style={[theme.typography.h2, { color: colors.textPrimary, marginBottom: 8 }]}>
          Select {labels[target ?? "institution"]}
        </Text>

        {target && (
          <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
            {target === "institution" &&
              data?.institutions.map((i) => (
                <Pressable
                  key={i.id}
                  onPress={() => select("institution", i.name)}
                  style={({ pressed }) => [
                    styles.row,
                    {
                      backgroundColor: pressed ? colors.surfaceAlt : "transparent",
                      borderBottomColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      theme.typography.body,
                      {
                        color: colors.textPrimary,
                        flex: 1,
                        fontWeight: institutionId === i.id ? "700" : "400",
                      },
                    ]}
                  >
                    {i.name}
                  </Text>
                  {i.shortName ? (
                    <Text style={[theme.typography.bodySmall, { color: colors.textMuted }]}>
                      {i.shortName}
                    </Text>
                  ) : null}
                </Pressable>
              ))}

            {target === "faculty" &&
              availableFaculties.map((f) => (
                <Pressable
                  key={f.id}
                  onPress={() => select("faculty", f.name)}
                  style={({ pressed }) => [
                    styles.row,
                    {
                      backgroundColor: pressed ? colors.surfaceAlt : "transparent",
                      borderBottomColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      theme.typography.body,
                      {
                        color: colors.textPrimary,
                        fontWeight: faculty === f.name ? "700" : "400",
                      },
                    ]}
                  >
                    {f.name}
                  </Text>
                </Pressable>
              ))}

            {target === "department" &&
              availableDepartments.map((d) => (
                <Pressable
                  key={d.id}
                  onPress={() => select("department", d.name)}
                  style={({ pressed }) => [
                    styles.row,
                    {
                      backgroundColor: pressed ? colors.surfaceAlt : "transparent",
                      borderBottomColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      theme.typography.body,
                      {
                        color: colors.textPrimary,
                        fontWeight: department === d.name ? "700" : "400",
                      },
                    ]}
                  >
                    {d.name}
                  </Text>
                </Pressable>
              ))}

            {/* Fallback for schools/faculties not in the catalogue */}
            {(target === "institution" || target === "faculty" || target === "department") && (
              <>
                <Text
                  style={[
                    theme.typography.bodySmall,
                    { color: colors.textMuted, marginTop: 16, marginBottom: 8 },
                  ]}
                >
                  {target === "institution"
                    ? "Can't find your school?"
                    : target === "faculty"
                      ? "Can't find your faculty?"
                      : "Can't find your department?"}{" "}
                  Type it below instead.
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Pressable
                    onPress={() => submitCustom(target)}
                    style={{
                      padding: 10,
                      borderRadius: theme.radii.md,
                      backgroundColor: colors.accent,
                    }}
                  >
                    <Icon name="check" size={18} color="#17181A" />
                  </Pressable>
                  <View
                    style={{
                      flex: 1,
                      borderWidth: 1.5,
                      borderColor: colors.borderStrong,
                      borderRadius: theme.radii.md,
                      paddingHorizontal: 12,
                      paddingVertical: Platform.OS === "ios" ? 12 : 8,
                    }}
                  >
                    <TextInput
                      value={customInput}
                      onChangeText={setCustomInput}
                      onSubmitEditing={() => submitCustom(target)}
                      placeholder={
                        target === "institution"
                          ? "Type your school name"
                          : target === "faculty"
                            ? "Type your faculty"
                            : "Type your department"
                      }
                      placeholderTextColor={colors.textMuted}
                      autoFocus
                      style={{
                        width: "100%",
                        color: colors.textPrimary,
                        fontSize: 16,
                        fontFamily: theme.typography.body.fontFamily,
                      }}
                    />
                  </View>
                </View>
              </>
            )}

            {target === "faculty" && !institutionId && (
              <Text
                style={[theme.typography.bodySmall, { color: colors.textMuted, marginTop: 12 }]}
              >
                Pick an institution first to see its faculties.
              </Text>
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );

  const row = (t: PickerTarget) => {
    const value = currentValue(t);
    const placeholder = isPlaceholder(t);
    const disabled =
      t === "faculty" ? !institutionId : t === "department" ? !faculty : false;
    return (
      <Pressable
        onPress={() => !disabled && open(t)}
        style={[
          styles.field,
          {
            backgroundColor: colors.surface,
            borderColor: colors.borderStrong,
            borderRadius: theme.radii.md,
            opacity: disabled ? 0.45 : 1,
          },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{labels[t]}</Text>
          <Text
            style={[
              theme.typography.body,
              {
                color: placeholder ? colors.textMuted : colors.textPrimary,
                fontWeight: placeholder ? "400" : "600",
              },
            ]}
            numberOfLines={1}
          >
            {placeholder ? `Select ${labels[t].toLowerCase()}…` : value}
          </Text>
        </View>
        {!disabled && <Icon name="chevronDown" size={20} color={colors.textMuted} />}
      </Pressable>
    );
  };

  const sheetNode =
    Platform.OS === "web" ? (
      target ? (
        <View
          style={
            {
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 1000,
            } as never
          }
        >
          {sheet}
        </View>
      ) : null
    ) : (
      <Modal
        visible={Boolean(target)}
        transparent
        animationType="fade"
        onRequestClose={close}
        statusBarTranslucent
        navigationBarTranslucent
      >
        {sheet}
      </Modal>
    );

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>School (Institution)</Text>

      {loadError ? (
        <>
          <Text style={[theme.typography.bodySmall, { color: colors.error, marginBottom: 8 }]}>
            Couldn't load the school list — you can still type your faculty and department below.
          </Text>
          <Pressable onPress={load} style={{ alignSelf: "flex-start", marginBottom: 8 }} hitSlop={6}>
            <Text
              style={[
                theme.typography.captionBold,
                { color: colors.accent, textDecorationLine: "underline" },
              ]}
            >
              Retry
            </Text>
          </Pressable>
        </>
      ) : null}

      {row("institution")}
      {row("faculty")}
      {row("department")}

      {hint ? (
        <Text style={[styles.hint, { color: colors.textMuted }]}>{hint}</Text>
      ) : null}

      {loading && !data ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
          <ActivityIndicator size="small" color={colors.textMuted} />
          <Text style={[theme.typography.bodySmall, { color: colors.textMuted }]}>
            Loading Nigerian institutions…
          </Text>
        </View>
      ) : null}

      {!loading && data && data.institutions.length === 0 ? (
        <View
          style={{
            marginTop: 4,
            padding: 10,
            borderRadius: theme.radii.md,
            backgroundColor: colors.surfaceAlt,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={[theme.typography.bodySmall, { color: colors.textSecondary }]}>
            No schools are loaded yet. You can still type your faculty and department below —
            select any school or use the free-text boxes.
          </Text>
        </View>
      ) : null}

      {sheetNode}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
});
