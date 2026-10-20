import { router } from "expo-router";
import {
  Image,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function WelcomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.content}>
        {/* TiMed Logo */}
        <Image
          source={require("../../assets/images/timed-logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />

        {/* Application Name */}
        <Text style={styles.appName}>TiMed</Text>

        {/* Tagline */}
        <Text style={styles.tagline}>Manage your medications with ease.</Text>

        {/* Reminder Icon */}
        <View style={styles.bellContainer}>
          <Text style={styles.bellIcon}>🔔</Text>
        </View>

        {/* Application Description */}
        <Text style={styles.description}>
          TiMed helps you organize your medication schedules, receive timely
          reminders, and keep track of your medication adherence.
        </Text>

        {/* Get Started Button */}
        <Pressable
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
          ]}
          onPress={() => {
            router.replace("/(tabs)/dashboard");
          }}
        >
          <Text style={styles.buttonText}>Get Started →</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#405B97",
  },

  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },

  logo: {
    width: 180,
    height: 180,
    marginBottom: 30,
  },

  appName: {
    fontSize: 44,
    fontWeight: "800",
    color: "#FFF4D6",
    marginBottom: 14,
  },

  tagline: {
    fontSize: 16,
    color: "#F1F5F9",
    textAlign: "center",
    marginBottom: 45,
  },

  bellContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: "#FFF4D6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 30,
  },

  bellIcon: {
    fontSize: 28,
    color: "#FFF4D6",
  },

  description: {
    fontSize: 15,
    lineHeight: 24,
    color: "#F1F5F9",
    textAlign: "center",
    marginBottom: 35,
  },

  button: {
    backgroundColor: "#2858A0",
    paddingVertical: 15,
    paddingHorizontal: 45,
    borderRadius: 12,
    alignItems: "center",
    minWidth: 190,
  },

  buttonPressed: {
    opacity: 0.8,
  },

  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
