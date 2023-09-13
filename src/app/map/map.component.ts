import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import * as L from 'leaflet';
import * as turf from '@turf/turf';
import * as JSZip from 'jszip';
import JSZipUtils from 'jszip-utils';
import { read, utils, writeFile, writeFileXLSX } from 'xlsx';

export class Node {
  id: number;
  lat: number;
  lon: number;
  next_nodes: {
    id: number;
    distance: number;
    tags: any;
  }[]
  on_map: any;
}
export class Way {
  id: number;
  nodes: number[];
  tags: any;
}
export class Route {
  nodes: number[];
  distance: number;
  time: number;
}
interface DHRow {
  "Origin Stop Id": string;
  "Destination Stop Id": string;
  "Travel Time": number;
  "Distance": number;
  "Start Time Range": string;
  "End Time Range": string;
  "Generate Time": string;
  "Route Id": string;
  "Origin Stop Name": string;
  "Destination Stop Name": string;
  "Days Of Week": string;
  "Direction": string;
  "Purpose": string;
  "Alignment": string;
  "Pre-Layover Time": string;
  "Post-Layover Time": string;
  "updatedAt": string;
};
@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.scss']
})
export class MapComponent implements OnInit {
  constructor(
    private http: HttpClient
  ) { }
  public isLoading = 0;
  public lat = 52;
  public lng = 0;
  public map: any;
  public overpass_query = '';
  public bbox: any = '51.59253563764556,0.053386688232421875,51.61684410110071,0.11745929718017578';
  ngOnInit(): void {
    (async () => {
      this.isLoading += 1;
      this.map = L.map('map', {
        center: [this.lat, this.lng],
        zoom: 8,
      });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19, attribution: '&copy; Turf', }).addTo(this.map);
      //L.tileLayer('https://mt0.google.com/vt/lyrs=m@221097413,traffic&x={x}&y={y}&z={z}', { maxZoom: 19, attribution: '&copy; Turf', }).addTo(this.map);

      //const f = await fetch("/assets/catalogue.xlsx");
      //const ab = await f.arrayBuffer();
      //const wb = read(ab);
      //this.rows = utils.sheet_to_json<DHRow>(wb.Sheets[wb.SheetNames[0]]);
      //console.log(this.rows);
    })();
  }
  file: any;
  file_loading = false;
  dataJSON: any;
  //patterns: Pattern[] = [];
  stop_names: string[] = [];
  terminal_stops = [];
  terminal_stops_nodes = [];
  terminal_stops_on_map: any[] = [];
  sel_depot: any;
  sel_depot_on_map: any;
  rows: DHRow[] = [];
  produceXLSX() {
    this.rows = [];
    for (let stop of this.terminal_stops) {
      this.rows.push({
        "Origin Stop Id": this.sel_depot.id,
        "Destination Stop Id": stop.id,
        "Travel Time": stop.time,
        "Distance": stop.distance,
        "Start Time Range": '',
        "End Time Range": '',
        "Generate Time": '',
        "Route Id": '',
        "Origin Stop Name": this.sel_depot.short_description,
        "Destination Stop Name": stop.short_description,
        "Days Of Week": '',
        "Direction": '',
        "Purpose": '',
        "Alignment": '',
        "Pre-Layover Time": '',
        "Post-Layover Time": '',
        "updatedAt": ''
      });
    }
    const ws = utils.json_to_sheet(this.rows);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Data");
    writeFileXLSX(wb, "DH-Catalogue.xlsx");
  }
  readJSON(e) {
    this.is_loading = true;
    this.file_loading = true;
    console.log(e);

    this.file = e.currentFiles[0];
    const reader = new FileReader();
    reader.addEventListener(
      'load',
      () => {
        this.dataJSON = reader.result;
        this.dataJSON = JSON.parse(this.dataJSON);
        console.log('json', this.dataJSON);
        this.dataJSON.stops.sort((a, b) => (a.short_description < b.short_description) ? -1 : 1);
        for (let route of this.dataJSON.routes) {
          let stop = this.dataJSON.stops.find(el => el.id == route.trace_points[0].point);
          if (stop !== undefined && this.terminal_stops.indexOf(stop) == -1)
            this.terminal_stops.push(stop);
          stop = this.dataJSON.stops.find(el => el.id == route.trace_points[route.trace_points.length - 1].point);
          if (stop !== undefined && this.terminal_stops.indexOf(stop) == -1)
            this.terminal_stops.push(stop);
        }
        console.log('terminal_stops', this.terminal_stops);
        for (let ts of this.terminal_stops) {
          this.terminal_stops_on_map.push(L.circle([ts.lat, ts.long]).addTo(this.map));
        }
        let features = turf.points(this.terminal_stops.map(el => [parseFloat(el.long), parseFloat(el.lat)]));
        let center = turf.center(features);
        console.log('center', center);
        let bbox = turf.bbox(features);
        console.log('bbox', bbox);
        let radius = turf.distance([bbox[0], bbox[1]], center);
        console.log('radius', radius);
        bbox = turf.bbox(turf.circle(center, radius));
        console.log('bbox', bbox);
        //this.map.setView([center.geometry.coordinates[1],center.geometry.coordinates[0]],13);
        this.map.fitBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]]);
        this.bbox = bbox[1] + ',' + bbox[0] + ',' + bbox[3] + ',' + bbox[2];
        this.getOSMData();
      },
      false
    );
    if (this.file) reader.readAsText(this.file);
    this.file_loading = false;
  }

  depotChange() {
    this.is_loading = true;
    if (this.sel_depot_on_map) this.sel_depot_on_map.remove();
    this.sel_depot_on_map = L.circle([this.sel_depot.lat, this.sel_depot.long], { color: '#a00' }).addTo(this.map);
    let closest_node = this.findClosest(this.sel_depot.lat, this.sel_depot.long);
    console.log(this.sel_depot.lat, this.sel_depot.long);
    if (closest_node !== undefined) {
      this.findRoutes(closest_node);
    } else {
      alert('Check depot coordinates in the timeplan');
      this.is_loading = false;
    }
  }
  nodes: Node[] = [];
  ways: Way[] = [];

  pairwise(arr: number[]): number[][] {
    let arr1: number[][] = [];
    for (let i = 1; i < arr.length; i++) {
      arr1.push([arr[i - 1], arr[i]]);
    }
    return arr1;
  }
  nodes_index: Node[] = [];
  graph_shown = false;
  toggleGraphNodes() {
    for (let node of this.nodes) {
      if (this.graph_shown) {
        node.on_map.addTo(this.map);
      } else {
        node.on_map.remove();
      }
    }
  }
  graph_name = '';
  getOSMData() {
    this.http.get('https://overpass-api.de/api/interpreter?data=[out:json][timeout:300];(way["highway"="motorway"](' + this.bbox + ');way["highway"="motorway_link"](' + this.bbox + ');way["highway"="trunk"](' + this.bbox + ');way["highway"="trunk_link"](' + this.bbox + ');way["highway"="primary"](' + this.bbox + ');way["highway"="secondary"](' + this.bbox + ');way["highway"="secondary_link"](' + this.bbox + ');way["highway"="tertiary"](' + this.bbox + ');way["highway"="residential"]["access"!="private"]["access"!="permissive"](' + this.bbox + ');way["highway"="living_street"](' + this.bbox + ');way["highway"="unclassified"](' + this.bbox + ');way["highway"="service"](' + this.bbox + ');way["highway"="service"]["bus"](' + this.bbox + '););out;>;out skel qt;').subscribe((data: any) => {
      //this.http.get('https://overpass-api.de/api/interpreter?data=[out:json][timeout:300];(way["highway"="motorway"](' + this.bbox + ');way["highway"="motorway_link"](' + this.bbox + ');way["highway"="trunk"](' + this.bbox + ');way["highway"="trunk_link"](' + this.bbox + ');way["highway"="primary"](' + this.bbox + ');way["highway"="secondary"](' + this.bbox + ');way["highway"="secondary_link"](' + this.bbox + ');way["highway"="tertiary"](' + this.bbox + ');way["highway"="residential"]["access"!="private"]["access"!="permissive"](' + this.bbox + ');way["highway"="living_street"](' + this.bbox + ');way["highway"="unclassified"](' + this.bbox + ');way["highway"="service"]["bus"](' + this.bbox + '););out;>;out skel qt;').subscribe((data: any) => {
      console.log(data);
      for (let el of data.elements) {
        if (el.type == 'node') {
          let on_map = L.circle([el.lat, el.lon], { radius: 1, opacity: .5, color: '#a77' })
            .on('click', e => { this.showWaysFromPoint(el.id) });
          this.nodes_index[el.id] = { id: el.id, lat: el.lat, lon: el.lon, next_nodes: [], on_map: on_map };
          this.nodes.push(this.nodes_index[el.id]);
        }
      }
      console.log('nodes created', this.nodes);
      for (let el of data.elements) {
        if (el.type == 'way') {
          this.ways.push({ id: el.id, nodes: el.nodes, tags: el.tags });
          for (let pair of this.pairwise(el.nodes)) {
            this.nodes_index[pair[0]].next_nodes.push({ id: pair[1], distance: 0, tags: el.tags });
            let other_dir = true;
            if (el.tags['junction'] && el.tags['junction'] == 'roundabout') other_dir = false;
            if (el.tags['oneway'] == 'yes' && el.tags['oneway:psv'] !== 'no' && el.tags['oneway:bus'] !== 'no') other_dir = false;
            if (other_dir) {
              this.nodes_index[pair[1]].next_nodes.push({ id: pair[0], distance: 0, tags: el.tags });
            }
          }
        }
      }
      console.log('ways', this.ways);
      console.log('next nodes filled', this.nodes);
      for (let n0 of this.nodes) {
        for (let nn of n0.next_nodes) {
          let n1 = this.nodes_index[nn.id];
          nn.distance = turf.distance([n0.lon, n0.lat], [n1.lon, n1.lat]);
        }
      }
      console.log('distances calculated', this.nodes);
      for (let ts of this.terminal_stops) {
        let ts_node = this.findClosest(ts.lat, ts.long);
        ts['node'] = ts_node;
        this.terminal_stops_nodes.push(ts_node);
      }
      console.log('terminal_stops_nodes', this.terminal_stops_nodes);
      let aws_nodes = [];
      for (let node of this.nodes) {
        aws_nodes.push({
          id: node.id,
          lat: node.lat,
          lon: node.lon,
          next_nodes: node.next_nodes,
        })
      }
      //console.log('nodes_index', JSON.stringify(this.nodes_index));
      let graph_name_file = String(new Date().valueOf()) + '_' + this.file.name;
      this.graph_name = graph_name_file + '.zip';
      //this.http.post('https://6igj3zibqanqrt76fn6smiarhq0sopnv.lambda-url.eu-west-2.on.aws/',{graph_name:this.file.name,content:this.nodes},{responseType:'text'}).subscribe(data=>{
      this.http.post('https://6igj3zibqanqrt76fn6smiarhq0sopnv.lambda-url.eu-west-2.on.aws/', { graph_name: this.graph_name }).subscribe((data: any) => {
        console.log(data);
        console.log(graph_name_file);
        let zf = new JSZip();
        zf.file(graph_name_file, JSON.stringify(aws_nodes));
        zf.generateAsync({type:'blob', compression:'DEFLATE', compressionOptions:{level:9}}).then((blob)=> {
          console.log(blob);
          this.http.put(data.return_url, blob, { responseType: 'text' }).subscribe(data1 => {
            console.log(data1);
            this.is_loading = false;
          });
        });
      });
    });
  }
  showWaysFromPoint(node_id) {
    let n0 = this.nodes.find(el => el.id == node_id);
    for (let nn of n0.next_nodes) {
      let n1 = this.nodes.find(n => n.id == nn.id);
      L.polyline([[n0.lat, n0.lon], [n1.lat, n1.lon]]).addTo(this.map);
    }
  }
  findClosest(lat: number, lon: number): number {
    let closest_node: number;
    let min_distance = 1000000;
    for (let node of this.nodes) {
      let dist = turf.distance([lon, lat], [node.lon, node.lat], { units: 'meters' });
      if (dist < min_distance) {
        min_distance = dist;
        closest_node = node.id;
      }
    }
    return closest_node;
  }
  visited_nodes: number[] = [];
  last_iter_added: number = 0;
  routes: number[][] = [];
  terminal_nodes_routes: {
    terminal_node: number;
    distance: number;
    time: number;
    route: number[];
  }[] = [];
  is_loading = false;
  default_speed = 40;
  min_time_to_nodes: number[] = [];
  min_dist_to_nodes: number[] = [];
  max_distance: number = 50;
  final_routes: Route[] = [];
  routes_on_map: { visible: boolean, shape: any }[] = [];
  steps = 0;
  addNodeToRoute(routes_queue: Route[]) {
    this.steps += 1;
    if (this.steps % 1000 == 0) console.log(this.steps, routes_queue.length);
    let new_queue: Route[] = [];
    for (let curr_route of routes_queue) {
      let last_node_id = curr_route.nodes[curr_route.nodes.length - 1];
      this.visited_nodes.push(last_node_id);
      this.nodes_index[last_node_id].on_map.setStyle({ color: '#7a7' });
      let go_on = true;
      if (this.min_dist_to_nodes[last_node_id] === undefined) {
        this.min_dist_to_nodes[last_node_id] = curr_route.distance;
      } else {
        if (this.min_dist_to_nodes[last_node_id] < curr_route.distance)
          go_on = false;
      }
      if (curr_route.distance > this.max_distance) go_on = false;
      if (this.terminal_stops_nodes.indexOf(curr_route.nodes[curr_route.nodes.length - 1]) !== -1) {
        let already_found = this.final_routes.find(el => el.nodes[el.nodes.length - 1] == curr_route.nodes[curr_route.nodes.length - 1]);
        if (already_found !== undefined) {
          if (already_found.time > curr_route.time) {
            already_found = curr_route;
            console.log('already_found updated', curr_route);
          } else {
            console.log('curr_route too long');
          }
        } else {
          this.final_routes.push(curr_route);
          console.log('route added', curr_route);
        }
      }
      if (go_on && this.final_routes.length < this.terminal_stops_nodes.length && this.nodes_index[last_node_id] !== undefined) {
        let last_node = this.nodes_index[last_node_id];
        let nodes_to_add: Node['next_nodes'] = [];
        for (let nn of last_node.next_nodes) {
          if (curr_route.nodes.indexOf(nn.id) === -1 && this.visited_nodes.indexOf(nn.id) === -1 && this.steps < 10000) {
            nodes_to_add.push(nn);
          }
        }
        /*
        while (nodes_to_add.length == 1) {
          curr_route.nodes.push(nodes_to_add[0].id);
          curr_route.distance += nodes_to_add[0].distance;
          curr_route.time += (nodes_to_add[0].distance / 40) * 60;
          last_node = this.nodes_index[nodes_to_add[0].id];
          let new_nodes_to_add: Node['next_nodes'] = [];
          for (let nn of last_node.next_nodes) {
            if (curr_route.nodes.indexOf(nn.id) === -1 && this.visited_nodes.indexOf(nn.id) === -1 && this.steps < 10000) {
              new_nodes_to_add.push(nn);
            }
          }
          nodes_to_add = new_nodes_to_add;
        }
        */
        for (let nn of nodes_to_add) {
          let n_speed = (nn.tags['maxspeed']) ? parseInt(nn.tags['maxspeed']) : this.default_speed;
          new_queue.push({
            nodes: [...curr_route.nodes, nn.id],
            distance: curr_route.distance + nn.distance,
            time: curr_route.time + (nn.distance / n_speed) * 60
          });
        }
      }
    }
    if (new_queue.length > 0) {
      this.addNodeToRoute(new_queue);
    } else {
      console.log('done');
      this.is_loading = false;
      this.displayRoutesOnMap();
    }
  }
  findRoutes(from_node: number) {
    let params = {
      graph_name: this.graph_name,
      from_node: from_node,
      max_distance: this.max_distance,
      default_speed: this.default_speed,
      terminal_stops_nodes: this.terminal_stops_nodes
    }
    console.log('params', params);
    //this.http.post('https://nm44b4ozspeslefujndie6uf4q0tzdyg.lambda-url.eu-west-2.on.aws/?'+String(new Date().valueOf()), params).subscribe((data: any) => {
    //  console.log('AWS thinks that final_routes are ', data);
    //  this.final_routes = data;
    //  this.displayRoutesOnMap();
    //});

    console.log(from_node);
    let new_queue: Route[] = [];
    for (let nn of this.nodes_index[from_node].next_nodes) {
      this.min_dist_to_nodes[nn.id] = nn.distance;
      this.min_time_to_nodes[nn.id] = (nn.distance / 40) * 60;
      let n_speed = (nn.tags['maxspeed']) ? parseInt(nn.tags['maxspeed']) : this.default_speed;
      new_queue.push({
        nodes: [from_node, nn.id],
        distance: nn.distance,
        time: (nn.distance / n_speed) * 60
      });
      this.addNodeToRoute(new_queue);
    }
  }
  displayRoutesOnMap() {
    for (let route of this.final_routes) {
      if (this.nodes_index[route.nodes[0]] !== undefined) {
        route.distance = Math.round(route.distance * 1000) / 1000;
        route.time = Math.ceil(route.time);
        //console.log(route);
        if (this.routes_on_map[route.nodes[route.nodes.length - 1]] === undefined) {
          this.routes_on_map[route.nodes[route.nodes.length - 1]] = {
            visible: false,
            shape: L.polyline(route.nodes.map(el => [this.nodes_index[el].lat, this.nodes_index[el].lon]))
          }
        }
        this.terminal_stops.filter(el => el.node == route.nodes[route.nodes.length - 1]).forEach(el => { el['distance'] = route.distance; });
        this.terminal_stops.filter(el => el.node == route.nodes[route.nodes.length - 1]).forEach(el => { el['time'] = route.time; });
      }
    }
    this.is_loading = false;
    /*
    for (let tnr of this.terminal_nodes_routes) {
      console.log(tnr);
      L.polyline(tnr.route.map(el => [this.nodes.find(n => n.id == el).lat, this.nodes.find(n => n.id == el).lon]))
        .bindTooltip(Math.round(tnr.distance * 1000) / 1000 + 'km, ' + Math.round(tnr.time) + 'min')
        .on('mouseover', (e) => { e.target.setStyle({ color: 'red' }); })
        .on('mouseout', (e) => { e.target.setStyle({ color: 'blue' }); })
        .addTo(this.map);
    }*/
  }
  toggleRouteOnMap(node) {
    this.routes_on_map[node].visible = !this.routes_on_map[node].visible;
    if (this.routes_on_map[node].visible === true) {
      this.routes_on_map[node].shape.addTo(this.map);
    } else {
      this.routes_on_map[node].shape.remove();
    }
  }
}