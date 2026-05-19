import re

with open("app/profile.tsx", "r") as f:
    content = f.read()

# 1. Add HEIGHT_OPTIONS and WEIGHT_OPTIONS
content = content.replace('const GENDERS = ["Male", "Female"];',
'''const GENDERS = ["Male", "Female"];
const HEIGHT_OPTIONS = Array.from({ length: 151 }, (_, i) => String(100 + i));
const WEIGHT_OPTIONS = Array.from({ length: 171 }, (_, i) => String(30 + i));''')

# 2. Add showHeightPicker and showWeightPicker
content = content.replace('const [showGenderPicker, setShowGenderPicker] = useState(false);',
'''const [showGenderPicker, setShowGenderPicker] = useState(false);
  const [showHeightPicker, setShowHeightPicker] = useState(false);
  const [showWeightPicker, setShowWeightPicker] = useState(false);''')

# 3. Replace TextInput with SelectInput and DropdownPicker for Height and Weight
target = '''                <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.subText, fontSize: 11, marginBottom: 4, marginLeft: 4 }}>Height (cm)</Text>
                    <TextInput placeholder="170" placeholderTextColor={colors.subText} style={[styles.input, { backgroundColor: colors.bg, color: colors.text, marginBottom: 0 }]} value={localProfile.height} onChangeText={(t) => setLocalProfile({ ...localProfile, height: t })} keyboardType="numeric" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.subText, fontSize: 11, marginBottom: 4, marginLeft: 4 }}>Weight (kg)</Text>
                    <TextInput placeholder="70" placeholderTextColor={colors.subText} style={[styles.input, { backgroundColor: colors.bg, color: colors.text, marginBottom: 0 }]} value={localProfile.weight} onChangeText={(t) => setLocalProfile({ ...localProfile, weight: t })} keyboardType="numeric" />
                  </View>
                </View>'''

replacement = '''                <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.subText, fontSize: 11, marginBottom: 4, marginLeft: 4 }}>Height (cm)</Text>
                    <SelectInput
                      placeholder="Select Height"
                      value={localProfile.height || ""}
                      onPress={() => setShowHeightPicker(true)}
                      colors={colors}
                    />
                    <DropdownPicker
                      visible={showHeightPicker}
                      options={HEIGHT_OPTIONS}
                      selected={localProfile.height || ""}
                      onSelect={(v) => setLocalProfile({ ...localProfile, height: v })}
                      onClose={() => setShowHeightPicker(false)}
                      colors={colors}
                      title="Select Height (cm)"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.subText, fontSize: 11, marginBottom: 4, marginLeft: 4 }}>Weight (kg)</Text>
                    <SelectInput
                      placeholder="Select Weight"
                      value={localProfile.weight || ""}
                      onPress={() => setShowWeightPicker(true)}
                      colors={colors}
                    />
                    <DropdownPicker
                      visible={showWeightPicker}
                      options={WEIGHT_OPTIONS}
                      selected={localProfile.weight || ""}
                      onSelect={(v) => setLocalProfile({ ...localProfile, weight: v })}
                      onClose={() => setShowWeightPicker(false)}
                      colors={colors}
                      title="Select Weight (kg)"
                    />
                  </View>
                </View>'''

content = content.replace(target, replacement)

with open("app/profile.tsx", "w") as f:
    f.write(content)
