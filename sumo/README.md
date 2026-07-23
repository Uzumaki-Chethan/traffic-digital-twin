# SUMO intersection example

This folder contains a simple SUMO intersection example.

To generate the network file from the separate XML components, run:

```bash
netconvert --node-files=network/intersection.nod.xml --edge-files=network/intersection.edg.xml --type-files=network/intersection.type.xml -o network/intersection.net.xml
```

Then run the simulation with:

```bash
sumo -c config/intersection.sumocfg
```
