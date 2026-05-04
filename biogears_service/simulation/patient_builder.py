from biogears_service.simulation.config import SCENARIO_API_DIR

# -------------------------------------------------
# 1️⃣ INITIALIZE NEW DIGITAL TWIN
# -------------------------------------------------
def build_initialization_scenario(user_id, age, weight, height, sex, body_fat, hr, rr, sys, dia):

    scenario_file = SCENARIO_API_DIR / f"init_{user_id}.xml"

    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Scenario xmlns="uri:/mil/tatrc/physiology/datamodel"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          contentVersion="BioGears_7.5.0"
          xsi:schemaLocation="uri:/mil/tatrc/physiology/datamodel xsd/BioGearsDataModel.xsd">

  <Name>Initialize {user_id}</Name>

  <PatientFile>patients/StandardMale.xml</PatientFile>

  <InitialParameters>
    <Patient>
      <Age value="{age}" unit="yr"/>
      <Weight value="{weight}" unit="kg"/>
      <Height value="{height}" unit="cm"/>
      <BodyFatFraction value="{body_fat}"/>
      <HeartRateBaseline value="{hr}" unit="1/min"/>
      <RespirationRateBaseline value="{rr}" unit="1/min"/>
      <SystolicArterialPressureBaseline value="{sys}" unit="mmHg"/>
      <DiastolicArterialPressureBaseline value="{dia}" unit="mmHg"/>
    </Patient>
  </InitialParameters>

  # <AutoSerialization>
  #   <Directory>states/States/UserStates</Directory>
  #   <FileName>{user_id}.xml</FileName>
  #   <AfterActions>On</AfterActions>
  #   <Period unit="s" value="1"/>
  #   <PeriodTimeStamps>Off</PeriodTimeStamps>
  #   <ReloadState>Off</ReloadState>
  # </AutoSerialization>

  <Actions>
    <Action xsi:type="AdvanceTimeData">
      <Time value="30" unit="s"/>
    </Action>
  </Actions>

  <Action xsi:type="SerializeStateData">
      <Filename>states/States/UserStates/{user_id}.xml</Filename>
  </Action>

</Scenario>
"""

    scenario_file.write_text(xml, encoding="utf-8")
    return scenario_file.name


# -------------------------------------------------
# 2️⃣ CONTINUATION SIMULATION
# -------------------------------------------------
def build_runtime_scenario(user_id, simulation_time):

    scenario_file = SCENARIO_API_DIR / f"run_{user_id}.xml"

    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Scenario xmlns="uri:/mil/tatrc/physiology/datamodel"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          contentVersion="BioGears_7.5.0"
          xsi:schemaLocation="uri:/mil/tatrc/physiology/datamodel xsd/BioGearsDataModel.xsd">

  <Name>Run {user_id}</Name>

  <EngineStateFile>states/States/UserStates/{user_id}.xml</EngineStateFile>

  # <AutoSerialization>
  #   <Directory>states/States/UserStates</Directory>
  #   <FileName>{user_id}.xml</FileName>
  #   <AfterActions>On</AfterActions>
  #   <Period unit="s" value="0"/>
  #   <PeriodTimeStamps>Off</PeriodTimeStamps>
  #   <ReloadState>Off</ReloadState>
  # </AutoSerialization>

  <DataRequests Filename="Scenarios/API/run_{user_id}Results.csv">
        <DataRequest xsi:type="PhysiologyDataRequestData" Name="HeartRate" Unit="1/min"/>
        <DataRequest xsi:type="PhysiologyDataRequestData" Name="MeanArterialPressure" Unit="mmHg"/>
        <DataRequest xsi:type="PhysiologyDataRequestData" Name="OxygenSaturation" Unit="unitless"/>
  </DataRequests>

  <Actions>
    <Action xsi:type="AdvanceTimeData">
      <Time value="{simulation_time}" unit="s"/>
    </Action>
  </Actions>

</Scenario>
"""

    scenario_file.write_text(xml, encoding="utf-8")
    return scenario_file.name
