import { Tabs } from "expo-router";
import {
  CalendarDays,
  ChartColumnIncreasing,
  House,
  Plus,
} from "lucide-react-native";
import { StyleSheet, View } from "react-native";

type TabIconProps = {
  focused: boolean;
  icon: "home" | "schedule" | "add" | "history";
};

function TabIcon({ focused, icon }: TabIconProps) {
  const iconColor = "#FFFFFF";

  return (
    <View style={styles.iconContainer}>
      {focused && <View style={styles.activeIndicator} />}

      {icon === "home" && (
        <House size={25} color={iconColor} strokeWidth={2.2} />
      )}
      {icon === "schedule" && (
        <CalendarDays size={25} color={iconColor} strokeWidth={2.2} />
      )}
      {icon === "add" && <Plus size={29} color={iconColor} strokeWidth={2.2} />}
      {icon === "history" && (
        <ChartColumnIncreasing size={25} color={iconColor} strokeWidth={2.2} />
      )}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#FFFFFF",
        tabBarInactiveTintColor: "#FFFFFF",
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "500",
          marginTop: 3,
        },
        tabBarStyle: {
          position: "absolute",
          backgroundColor: "#345B7B",
          borderTopWidth: 0,
          borderRadius: 30,
          marginHorizontal: 18,
          marginBottom: 12,
          height: 78,
          paddingTop: 12,
          paddingBottom: 10,
          elevation: 0,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="home" />
          ),
        }}
      />

      <Tabs.Screen
        name="schedule"
        options={{
          title: "Schedule",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="schedule" />
          ),
        }}
      />

      <Tabs.Screen
        name="add"
        options={{
          title: "Add",
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="add" />,
        }}
      />

      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="history" />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    alignItems: "center",
    justifyContent: "center",
    width: 45,
    height: 30,
  },

  activeIndicator: {
    position: "absolute",
    top: -9,
    width: 20,
    height: 3,
    borderRadius: 3,
    backgroundColor: "#F49BAA",
  },
});
