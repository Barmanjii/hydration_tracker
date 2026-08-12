/**
 * The only screen.
 *
 * Everything here serves one number: how long it takes to log a drink. The
 * preset buttons are large, there is no navigation to get through, and no
 * confirmation step. Undo is what makes that safe.
 *
 * Progress is a plain bar rather than a ring. A ring would mean adding an SVG
 * dependency for something a View with a width can already express.
 */

import { StatusBar } from "expo-status-bar";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { DRINK_PRESETS } from "../domain/goal";
import { useIntake } from "./useIntake";

export function HomeScreen() {
  const { loading, error, todayMl, goalMl, progress, streak, canUndo, log, undo } =
    useIntake();

  if (loading) {
    return (
      <SafeAreaView style={[styles.screen, styles.centred]}>
        <ActivityIndicator size="large" color={colours.accent} />
        <StatusBar style="dark" />
      </SafeAreaView>
    );
  }

  const remainingMl = Math.max(0, goalMl - todayMl);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.summary}>
          <Text style={styles.total}>
            {todayMl}
            <Text style={styles.unit}> ml</Text>
          </Text>
          <Text style={styles.goalLine}>
            {remainingMl > 0
              ? `${remainingMl} ml to go`
              : "Goal reached for today"}
          </Text>
        </View>

        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        </View>

        <Text style={styles.streak}>
          {/* Zero is stated plainly rather than hidden. A tracker that only
              shows good news is not a tracker. */}
          {streak === 0
            ? "No streak yet"
            : `${streak} day streak`}
        </Text>

        <View style={styles.presets}>
          {DRINK_PRESETS.map((preset) => (
            <Pressable
              key={preset.amountMl}
              accessibilityRole="button"
              accessibilityLabel={`Log ${preset.amountMl} millilitres`}
              style={({ pressed }) => [
                styles.preset,
                pressed && styles.presetPressed,
              ]}
              onPress={() => void log(preset.amountMl)}
            >
              <Text style={styles.presetLabel}>{preset.label}</Text>
              <Text style={styles.presetAmount}>{preset.amountMl} ml</Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Undo the last drink logged today"
          disabled={!canUndo}
          style={({ pressed }) => [
            styles.undo,
            pressed && styles.undoPressed,
            !canUndo && styles.undoDisabled,
          ]}
          onPress={() => void undo()}
        >
          <Text style={[styles.undoLabel, !canUndo && styles.undoLabelDisabled]}>
            Undo last drink
          </Text>
        </Pressable>
      </View>

      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

const colours = {
  background: "#f7f9fb",
  surface: "#ffffff",
  accent: "#2d7ff9",
  accentSoft: "#e3edfd",
  text: "#12212e",
  muted: "#6b7c8c",
  border: "#dbe3ea",
  errorBackground: "#fdecec",
  errorText: "#8c1d1d",
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colours.background,
  },
  centred: {
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
    justifyContent: "center",
    gap: 24,
  },
  errorBanner: {
    backgroundColor: colours.errorBackground,
    borderRadius: 12,
    padding: 12,
  },
  errorText: {
    color: colours.errorText,
    fontSize: 14,
  },
  summary: {
    alignItems: "center",
    gap: 6,
  },
  total: {
    color: colours.text,
    fontSize: 64,
    fontWeight: "700",
  },
  unit: {
    color: colours.muted,
    fontSize: 24,
    fontWeight: "500",
  },
  goalLine: {
    color: colours.muted,
    fontSize: 16,
  },
  track: {
    height: 14,
    borderRadius: 7,
    backgroundColor: colours.accentSoft,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 7,
    backgroundColor: colours.accent,
  },
  streak: {
    color: colours.muted,
    fontSize: 15,
    textAlign: "center",
  },
  presets: {
    flexDirection: "row",
    gap: 12,
  },
  preset: {
    flex: 1,
    // Tall on purpose. This is the target that has to be hittable without
    // looking at the screen properly.
    paddingVertical: 22,
    borderRadius: 16,
    backgroundColor: colours.surface,
    borderWidth: 1,
    borderColor: colours.border,
    alignItems: "center",
    gap: 4,
  },
  presetPressed: {
    backgroundColor: colours.accentSoft,
    borderColor: colours.accent,
  },
  presetLabel: {
    color: colours.text,
    fontSize: 16,
    fontWeight: "600",
  },
  presetAmount: {
    color: colours.muted,
    fontSize: 13,
  },
  undo: {
    alignSelf: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  undoPressed: {
    backgroundColor: colours.accentSoft,
  },
  undoDisabled: {
    opacity: 1,
  },
  undoLabel: {
    color: colours.accent,
    fontSize: 15,
    fontWeight: "600",
  },
  undoLabelDisabled: {
    color: colours.border,
  },
});
