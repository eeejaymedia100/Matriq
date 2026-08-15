import React, { useState } from "react";
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  Pressable,
  TextInput,
} from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { ThemedScreen } from "../../components/Surface";
import { Icon } from "../../components/icons";
import { saveGeneratedFile } from "../../utils/files";

type Format = "apa" | "mla" | "harvard";
type SourceType = "book" | "website" | "journal";

interface Seg {
  text: string;
  italic?: boolean;
}

const FORMATS: { id: Format; label: string }[] = [
  { id: "apa", label: "APA" },
  { id: "mla", label: "MLA" },
  { id: "harvard", label: "Harvard" },
];

const SOURCES: { id: SourceType; label: string }[] = [
  { id: "book", label: "Book" },
  { id: "website", label: "Website" },
  { id: "journal", label: "Journal article" },
];

function seg(text: string, italic = false): Seg {
  return { text, italic };
}

function buildCitation(
  format: Format,
  type: SourceType,
  f: Record<string, string>,
): Seg[] {
  const author = f.authors.trim();
  const title = f.title.trim();
  const year = f.year.trim();
  const out: Seg[] = [];

  const authorSeg = () => (author ? [seg(author + "."), seg(" ")] : []);
  const titlePlain = (q?: boolean) =>
    title ? [seg(q ? `"${title}."` : `${title}.`), seg(" ")] : [];

  if (type === "book") {
    const publisher = f.publisher.trim();
    if (format === "apa") {
      if (author) out.push(seg(author + "."), seg(" "));
      if (year) out.push(seg(`(${year}).`), seg(" "));
      if (title) out.push(seg(title + ".", true), seg(" "));
      if (publisher) out.push(seg(publisher + "."));
    } else if (format === "mla") {
      if (author) out.push(seg(author + "."), seg(" "));
      if (title) out.push(seg(title + ".", true), seg(" "));
      if (publisher) out.push(seg(publisher + ","), seg(" "));
      if (year) out.push(seg(year + "."));
    } else {
      if (author) out.push(seg(author + ", "));
      if (year) out.push(seg(year + "."), seg(" "));
      if (title) out.push(seg(title + ".", true), seg(" "));
      if (publisher) out.push(seg(publisher + "."));
    }
  } else if (type === "website") {
    const siteName = f.siteName.trim();
    const url = f.url.trim();
    if (format === "apa") {
      if (author) out.push(seg(author + "."), seg(" "));
      if (year) out.push(seg(`(${year}).`), seg(" "));
      if (title) out.push(seg(title + ".", true), seg(" "));
      if (siteName) out.push(seg(siteName + ". "));
      if (url) out.push(seg(url));
    } else if (format === "mla") {
      if (author) out.push(seg(author + "."), seg(" "));
      if (title) out.push(seg(`"${title}."`), seg(" "));
      if (siteName) out.push(seg(siteName + ",", true), seg(" "));
      if (year) out.push(seg(year + ","), seg(" "));
      if (url) out.push(seg(url + "."));
    } else {
      if (author) out.push(seg(author + ", "));
      if (year) out.push(seg(year + "."), seg(" "));
      if (title) out.push(seg(title + ".", true), seg(" "));
      if (url) out.push(seg(`Available at: ${url}`));
      const accessed = f.accessed.trim();
      if (accessed) out.push(seg(` (Accessed: ${accessed})`));
    }
  } else {
    const journal = f.journalName.trim();
    const volume = f.volume.trim();
    const issue = f.issue.trim();
    const pages = f.pages.trim();
    if (format === "apa") {
      if (author) out.push(seg(author + "."), seg(" "));
      if (year) out.push(seg(`(${year}).`), seg(" "));
      if (title) out.push(seg(title + ". "));
      if (journal) out.push(seg(journal + ",", true), seg(" "));
      if (volume) out.push(seg(volume, true));
      if (issue) out.push(seg(`(${issue})`));
      out.push(seg(pages ? `, ${pages}.` : "."));
    } else if (format === "mla") {
      if (author) out.push(seg(author + "."), seg(" "));
      if (title) out.push(seg(`"${title}."`), seg(" "));
      if (journal) out.push(seg(journal + ",", true), seg(" "));
      if (volume) out.push(seg(`vol. ${volume},`), seg(" "));
      if (issue) out.push(seg(`no. ${issue},`), seg(" "));
      if (year) out.push(seg(year + ","), seg(" "));
      if (pages) out.push(seg(`pp. ${pages}.`));
    } else {
      if (author) out.push(seg(author + ", "));
      if (year) out.push(seg(year + "."), seg(" "));
      if (title) out.push(seg(`'${title}',`), seg(" "));
      if (journal) out.push(seg(journal + ",", true), seg(" "));
      if (volume) out.push(seg(`vol. ${volume}`));
      if (issue) out.push(seg(`, no. ${issue}`));
      out.push(seg(pages ? `, pp. ${pages}.` : "."));
    }
  }

  return out;
}

export function CitationScreen() {
  const { theme } = useTheme();
  const colors = theme.colors;
  const [format, setFormat] = useState<Format>("apa");
  const [sourceType, setSourceType] = useState<SourceType>("book");
  const [f, setF] = useState<Record<string, string>>({
    authors: "",
    title: "",
    year: "",
    publisher: "",
    siteName: "",
    url: "",
    accessed: "",
    journalName: "",
    volume: "",
    issue: "",
    pages: "",
  });

  const set = (k: string) => (v: string) => setF((prev) => ({ ...prev, [k]: v }));

  const segments = buildCitation(format, sourceType, f);
  const hasContent = segments.some((s) => s.text.trim().length > 0);

  const save = async () => {
    const plain = segments.map((s) => s.text).join("").trim();
    if (!plain) return;
    let binary = "";
    for (let i = 0; i < plain.length; i += 1) {
      binary += String.fromCharCode(plain.charCodeAt(i) & 0xff);
    }
    const base64 = btoa(binary);
    await saveGeneratedFile("citation.txt", base64, "text/plain");
  };

  const inputStyle = {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: theme.radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
  };

  const renderField = (key: string, label: string, placeholder: string) => (
    <View style={{ marginBottom: 12 }}>
      <Text style={[theme.typography.captionBold, { color: colors.textSecondary, marginBottom: 6 }]}>
        {label}
      </Text>
      <TextInput
        value={f[key]}
        onChangeText={set(key)}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={inputStyle}
      />
    </View>
  );

  return (
    <ThemedScreen>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[theme.typography.display, { color: colors.textPrimary }]}>
            Citation generator
          </Text>
          <Text style={[theme.typography.body, { color: colors.textSecondary, marginTop: 4 }]}>
            Build a reference in APA, MLA or Harvard — then copy or save it.
          </Text>

          {/* Format + source type */}
          <Text style={[theme.typography.h3, { color: colors.textPrimary, marginTop: 24, marginBottom: 10 }]}>
            Format
          </Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            {FORMATS.map((fmt) => {
              const selected = format === fmt.id;
              return (
                <Pressable
                  key={fmt.id}
                  onPress={() => setFormat(fmt.id)}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    paddingVertical: 10,
                    borderRadius: theme.radii.md,
                    borderWidth: 1.5,
                    borderColor: selected ? colors.brand : colors.border,
                    backgroundColor: selected ? colors.surfaceAlt : colors.surface,
                  }}
                >
                  <Text style={[theme.typography.bodyBold, { fontSize: 13, color: colors.textPrimary }]}>
                    {fmt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[theme.typography.h3, { color: colors.textPrimary, marginTop: 20, marginBottom: 10 }]}>
            Source type
          </Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            {SOURCES.map((s) => {
              const selected = sourceType === s.id;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => setSourceType(s.id)}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    paddingVertical: 10,
                    borderRadius: theme.radii.md,
                    borderWidth: 1.5,
                    borderColor: selected ? colors.brand : colors.border,
                    backgroundColor: selected ? colors.surfaceAlt : colors.surface,
                  }}
                >
                  <Text style={[theme.typography.bodyBold, { fontSize: 13, color: colors.textPrimary }]}>
                    {s.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Fields */}
          <Text style={[theme.typography.h3, { color: colors.textPrimary, marginTop: 20, marginBottom: 12 }]}>
            Details
          </Text>
          {renderField("authors", "Author(s)", "e.g. Smith, J. or John Smith")}
          {renderField("title", "Title", "Title of the work")}
          {renderField("year", "Year", "2026")}
          {sourceType === "book" && renderField("publisher", "Publisher", "Publisher name")}
          {sourceType === "website" && (
            <>
              {renderField("siteName", "Site name", "Website name")}
              {renderField("url", "URL", "https://…")}
              {format === "harvard" && renderField("accessed", "Accessed", "15 Aug 2026")}
            </>
          )}
          {sourceType === "journal" && (
            <>
              {renderField("journalName", "Journal", "Journal name")}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>{renderField("volume", "Volume", "12")}</View>
                <View style={{ flex: 1 }}>{renderField("issue", "Issue", "3")}</View>
                <View style={{ flex: 1 }}>{renderField("pages", "Pages", "45–60")}</View>
              </View>
            </>
          )}

          {/* Result */}
          <Text style={[theme.typography.h3, { color: colors.textPrimary, marginTop: 20, marginBottom: 12 }]}>
            Citation
          </Text>
          <View
            style={{
              padding: 16,
              borderRadius: theme.radii.lg,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            {hasContent ? (
              <Text selectable style={[theme.typography.body, { color: colors.textPrimary, lineHeight: 24 }]}>
                {segments.map((s, i) => (
                  <Text key={i} style={s.italic ? { fontStyle: "italic" } : undefined}>
                    {s.text}
                  </Text>
                ))}
              </Text>
            ) : (
              <Text style={[theme.typography.body, { color: colors.textMuted }]}>
                Fill in the details above to see the citation.
              </Text>
            )}
          </View>

          {hasContent ? (
            <Pressable
              onPress={() => void save()}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                marginTop: 14,
                paddingVertical: 13,
                borderRadius: theme.radii.md,
                backgroundColor: colors.accent,
              }}
            >
              <Icon name="download" size={16} color="#170B26" />
              <Text style={{ fontFamily: "PlusJakartaSans_700Bold", fontSize: 14, color: "#170B26" }}>
                Save as text
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedScreen>
  );
}
