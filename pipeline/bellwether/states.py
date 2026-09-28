STATES = {
 "Alabama":"AL","Alaska":"AK","Arizona":"AZ","Arkansas":"AR","California":"CA","Colorado":"CO","Connecticut":"CT",
 "Delaware":"DE","Florida":"FL","Georgia":"GA","Hawaii":"HI","Idaho":"ID","Illinois":"IL","Indiana":"IN","Iowa":"IA",
 "Kansas":"KS","Kentucky":"KY","Louisiana":"LA","Maine":"ME","Maryland":"MD","Massachusetts":"MA","Michigan":"MI",
 "Minnesota":"MN","Mississippi":"MS","Missouri":"MO","Montana":"MT","Nebraska":"NE","Nevada":"NV","New Hampshire":"NH",
 "New Jersey":"NJ","New Mexico":"NM","New York":"NY","North Carolina":"NC","North Dakota":"ND","Ohio":"OH",
 "Oklahoma":"OK","Oregon":"OR","Pennsylvania":"PA","Rhode Island":"RI","South Carolina":"SC","South Dakota":"SD",
 "Tennessee":"TN","Texas":"TX","Utah":"UT","Vermont":"VT","Virginia":"VA","Washington":"WA","West Virginia":"WV",
 "Wisconsin":"WI","Wyoming":"WY",
}
NAMES = {v: k for k, v in STATES.items()}
# Census region used for regional correlated error.
REGION = {}
for s in "CT ME MA NH RI VT NJ NY PA".split(): REGION[s] = "northeast"
for s in "IL IN MI OH WI IA KS MN MO NE ND SD".split(): REGION[s] = "midwest"
for s in "DE FL GA MD NC SC VA WV AL KY MS TN AR LA OK TX".split(): REGION[s] = "south"
for s in "AZ CO ID MT NV NM UT WY AK CA HI OR WA".split(): REGION[s] = "west"
# Elections rules the model and pages must respect.
RCV_GENERAL = {"ME", "AK"}          # ranked-choice general elections (AK also top-four primary)
RUNOFF_GENERAL = {"GA"}             # majority required in the general, else a December runoff
TOP_TWO = {"CA", "WA"}              # top-two primaries: two same-party finalists possible
